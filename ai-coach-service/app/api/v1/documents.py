from fastapi import APIRouter, Request, UploadFile, File, Depends, HTTPException, status, Query
from typing import Dict, Any
import base64
import hashlib
import io
import structlog

from pypdf import PdfReader
from pypdf.errors import PdfReadError

from app.middleware.auth import get_current_user
from app.core.rate_limiter import (
    check_rate_limit,
    DOCUMENT_UPLOAD_MAX_REQUESTS,
    DOCUMENT_UPLOAD_WINDOW_SECONDS,
)
from app.services.attachment_service import AttachmentService, normalize_image

logger = structlog.get_logger()
router = APIRouter(prefix="/documents", tags=["documents"])

# Magic bytes for file type validation
# Using magic bytes instead of client-provided MIME type for security
MAGIC_BYTES = {
    b"%PDF": ("application/pdf", "pdf"),
    b"\x89PNG": ("image/png", "image"),
    b"\xff\xd8\xff": ("image/jpeg", "image"),
    b"GIF87a": ("image/gif", "image"),
    b"GIF89a": ("image/gif", "image"),
    b"RIFF": ("image/webp", "image"),  # WebP starts with RIFF, need to check for WEBP at offset 8
}

# File size and page limits
MAX_FILE_SIZE = 32 * 1024 * 1024  # 32MB
MAX_PDF_PAGES = 20
CHUNK_SIZE = 64 * 1024  # 64KB for chunked reading


def validate_magic_bytes(content: bytes) -> tuple[str, str] | None:
    """
    Validate file type using magic bytes.

    Returns tuple of (mime_type, file_type) or None if invalid.
    """
    for magic, (mime_type, file_type) in MAGIC_BYTES.items():
        if content.startswith(magic):
            # Special handling for WebP - need to verify WEBP signature at offset 8
            if magic == b"RIFF" and len(content) >= 12:
                if content[8:12] != b"WEBP":
                    continue
            return (mime_type, file_type)
    return None


@router.post("/upload")
async def upload_document(
    http_request: Request,
    file: UploadFile = File(...),
    extraction_prompt: str = Query(..., description="What information to extract from the document"),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Upload a document (PDF or image) for AI analysis.

    Supports:
    - PDF files (max 20 pages)
    - Images: PNG, JPEG, WebP, GIF

    Returns file content formatted for OpenAI multimodal API.
    """
    user_id = current_user["user_id"]

    # Rate limit check AFTER authentication (so we have user_id)
    check_rate_limit(
        user_id=user_id,
        max_requests=DOCUMENT_UPLOAD_MAX_REQUESTS,
        window_seconds=DOCUMENT_UPLOAD_WINDOW_SECONDS,
    )

    logger.info(
        "Document upload started",
        user_id=user_id,
        filename=file.filename,
        content_type=file.content_type
    )

    # Chunked reading for memory efficiency
    chunks = []
    total_size = 0

    while chunk := await file.read(CHUNK_SIZE):
        total_size += len(chunk)
        if total_size > MAX_FILE_SIZE:
            logger.warning("File too large", user_id=user_id, size=total_size)
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024 * 1024)}MB"
            )
        chunks.append(chunk)

    content = b"".join(chunks)

    # Validate empty file
    if total_size == 0:
        logger.warning("Empty file uploaded", user_id=user_id)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is empty"
        )

    # Validate file type using magic bytes (not client MIME type)
    validated = validate_magic_bytes(content)
    if not validated:
        logger.warning(
            "Unsupported file type",
            user_id=user_id,
            filename=file.filename,
            content_type=file.content_type
        )
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported file type. Supported types: PDF, PNG, JPEG, WebP, GIF"
        )

    mime_type, file_type = validated

    # PDF page limit validation - reject unparseable PDFs
    pdf_pages = None
    pdf_page_count = 0
    if file_type == "pdf":
        try:
            pdf_reader = PdfReader(io.BytesIO(content))
            page_count = len(pdf_reader.pages)
            if page_count > MAX_PDF_PAGES:
                logger.warning(
                    "PDF exceeds page limit",
                    user_id=user_id,
                    pages=page_count,
                    max_pages=MAX_PDF_PAGES
                )
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"PDF exceeds maximum of {MAX_PDF_PAGES} pages (has {page_count} pages)"
                )
            logger.info("PDF validated", user_id=user_id, pages=page_count)
            pdf_page_count = page_count
            # Extract per-page text NOW, while the reader is in hand — it is
            # persisted as the permanent replay floor for later turns (the raw
            # PDF is only re-sent inside the replay turn-window).
            try:
                pdf_pages = [page.extract_text() or "" for page in pdf_reader.pages]
            except Exception as e:
                logger.warning(
                    "PDF text extraction failed; storing as non-extractable",
                    user_id=user_id,
                    error=str(e),
                )
                pdf_pages = []
        except PdfReadError as e:
            logger.warning(
                "Invalid or corrupted PDF",
                user_id=user_id,
                filename=file.filename,
                error=str(e)
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or corrupted PDF file. Please upload a valid PDF."
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                "Unexpected error parsing PDF",
                user_id=user_id,
                filename=file.filename,
                error=str(e)
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not process PDF file. Please ensure it is a valid PDF."
            )

    # Full digest for the dedupe key (a 16-char truncation is fine for logs,
    # thin for identity); computed over the ORIGINAL bytes — dedupe keys on
    # what the user re-uploads, not on normalization output.
    content_hash = hashlib.sha256(content).hexdigest()

    # Images: normalize once (downscale + EXIF-orient). The normalized render
    # is BOTH what turn 1 sends and what gets stored for replay — the two must
    # stay byte-identical.
    normalized_bytes = None
    if file_type == "image":
        normalized_bytes, mime_type = normalize_image(content, mime_type)

    # Persist artifacts so the attachment survives past this request: extracted
    # text for PDFs (replay floor), normalized bytes for images (no text floor).
    attachment_id = None
    try:
        attachment_service = AttachmentService(http_request.app.state.db)
        persisted = await attachment_service.create_or_get(
            user_id=user_id,
            filename=file.filename,
            mime_type=mime_type,
            kind=file_type,
            size_bytes=total_size,
            content_hash=content_hash,
            pages=pdf_pages,
            page_count=pdf_page_count,
            # In-window replay re-sends these bytes: the PDF original (page-image
            # fidelity must match turn 1) or the image's normalized render (what
            # turn 1 itself sends).
            blob_bytes=content if file_type == "pdf" else normalized_bytes,
        )
        attachment_id = persisted["attachment_id"]
    except Exception as e:
        # A persistence failure degrades to the old ephemeral behaviour (file
        # works this turn, forgotten later) — never fail the upload for it.
        logger.error("Attachment persistence failed", user_id=user_id, error=str(e))

    # Build response content formatted for OpenAI API
    if file_type == "pdf":
        file_data = base64.b64encode(content).decode("utf-8")
        file_content = {
            "type": "file",
            "file": {
                "filename": file.filename,
                "file_data": f"data:{mime_type};base64,{file_data}"
            }
        }
    else:
        # detail is REQUIRED on GPT-5.6: omitted means `original` (no downscale,
        # no patch cap), so a 4000x3000 phone photo bills ~11.7k tokens. "high"
        # resizes under a finite patch budget (~2.5k tokens worst case). Keep it
        # identical everywhere this part is (re)built — replay must match turn 1.
        file_data = base64.b64encode(normalized_bytes).decode("utf-8")
        file_content = {
            "type": "image_url",
            "image_url": {
                "url": f"data:{mime_type};base64,{file_data}",
                "detail": "high"
            }
        }

    logger.info(
        "Document upload successful",
        user_id=user_id,
        filename=file.filename,
        mime_type=mime_type,
        size_bytes=total_size,
        content_hash=content_hash[:16],
        attachment_id=attachment_id,
    )

    return {
        "success": True,
        "file_content": file_content,
        "attachment_id": attachment_id,
        "prompt": extraction_prompt,
        "metadata": {
            "filename": file.filename,
            "mime_type": mime_type,
            "size_bytes": total_size,
            "content_hash": content_hash[:16],
        },
    }
