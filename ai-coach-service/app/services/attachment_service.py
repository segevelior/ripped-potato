"""Chat attachment persistence: extracted-text artifacts + normalized image blobs.

Uploads used to be ephemeral — base64 round-tripped through the browser and died
with the request, so the coach lost every attachment after one turn. This service
makes an attachment part of the thread:

- PDFs: text is extracted ONCE at upload and persisted (the out-of-window replay
  floor — see orchestrator attachment replay).
- Images: a normalized render is persisted in GridFS (images have no text floor,
  so replay needs the bytes).

Metadata lives in `chatAttachments`; image bytes live in the `chat_attachments`
GridFS bucket (`chat_attachments.files` / `.chunks`). Message documents carry
only `{attachment_id, filename, mime_type, kind}` refs — never bytes, never text.
"""

from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta

import structlog
from bson import ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorGridFSBucket

logger = structlog.get_logger()

# WRITER: ai-coach/app/services/attachment_service.py
COLLECTION_NAME = "chatAttachments"
GRIDFS_BUCKET_NAME = "chat_attachments"

# Cap on persisted extracted text. Sized for a full 20-page plan at ~3k chars a
# page — the tail of a max-size document must not be silently lost, because the
# text is the permanent replay floor. Truncation happens at page boundaries and
# is annotated via pages_dropped (the omitted_items precedent).
ATTACHMENT_TEXT_PERSIST_MAX_CHARS = 60_000

# Below this many extracted chars a PDF is treated as scanned/image-only
# (text_extractable=False): replay must not serve a near-empty floor as if it
# were the document.
MIN_EXTRACTABLE_CHARS = 200

# Never-sent uploads (attach-then-abandon: upload happens before send) expire
# via a TTL index on expires_at. The field is $unset at send time, and Mongo's
# TTL monitor skips documents where the indexed field is absent, so a sent
# attachment can never sweep.
ORPHAN_TTL = timedelta(hours=24)


# Image normalization: long edge cap. Tokens scale with pixel area, so this
# cuts a phone photo from ~11.7k to ~1-2k image tokens on every turn it appears.
NORMALIZED_LONG_EDGE = 1536
JPEG_QUALITY = 80


def _page_delimited_text(pages: List[str]) -> str:
    return "\n\n".join(
        f"[page {i + 1}]\n{text.strip()}" for i, text in enumerate(pages)
    )


def prepare_pdf_text(pages: List[str]) -> Dict[str, Any]:
    """Assemble the persisted text artifact from per-page extractions.

    Truncates at PAGE boundaries (a mid-page slice loses exactly the rows a
    follow-up asks about) and annotates the omission via pages_dropped —
    the omitted_items precedent. Pure; unit-testable without a DB.
    """
    kept = list(pages)
    while kept and len(_page_delimited_text(kept)) > ATTACHMENT_TEXT_PERSIST_MAX_CHARS:
        kept.pop()
    extracted_text = _page_delimited_text(kept)
    return {
        "extracted_text": extracted_text,
        "pages_kept": len(kept),
        "pages_dropped": len(pages) - len(kept),
        "text_extractable": len(extracted_text) >= MIN_EXTRACTABLE_CHARS,
    }


def normalize_image(content: bytes, mime_type: str) -> tuple:
    """Downscale, EXIF-orient, strip metadata, re-encode an uploaded image.

    Returns (normalized_bytes, normalized_mime_type). The normalized render is
    what gets stored AND what turn 1 sends — replay must be byte-identical to
    turn 1, so both must come from the same bytes. Falls back to the original
    on any decode failure (an image OpenAI may still accept shouldn't be lost
    to a Pillow edge case).
    """
    import io as _io

    from PIL import Image, ImageOps

    try:
        img = Image.open(_io.BytesIO(content))
        # Bake in EXIF orientation — the model can misread rotated phone photos.
        img = ImageOps.exif_transpose(img)
        long_edge = max(img.size)
        if long_edge > NORMALIZED_LONG_EDGE:
            scale = NORMALIZED_LONG_EDGE / long_edge
            img = img.resize(
                (max(1, round(img.width * scale)), max(1, round(img.height * scale))),
                Image.LANCZOS,
            )
        out = _io.BytesIO()
        if mime_type in ("image/png", "image/gif"):
            # Screenshots / line art: keep lossless. Re-encoding drops metadata.
            img.save(out, format="PNG")
            return out.getvalue(), "image/png"
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        img.save(out, format="JPEG", quality=JPEG_QUALITY)
        return out.getvalue(), "image/jpeg"
    except Exception as e:
        logger.warning(f"Image normalization failed, using original bytes: {e}")
        return content, mime_type


class AttachmentService:
    """Sole writer for chatAttachments and the chat_attachments GridFS bucket."""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db[COLLECTION_NAME]
        self.bucket = AsyncIOMotorGridFSBucket(db, bucket_name=GRIDFS_BUCKET_NAME)

    async def ensure_indexes(self) -> bool:
        try:
            # Dedupe key: one attachment doc per distinct file per user.
            await self.collection.create_index(
                [("user_id", 1), ("content_hash", 1)],
                unique=True,
                name="user_content_hash_unique",
            )
            # Orphan sweeper. partialFilterExpression is implicit: TTL skips
            # docs without the field, and send-time $unset removes it.
            await self.collection.create_index(
                "expires_at",
                expireAfterSeconds=0,
                name="orphan_ttl",
            )
            logger.info(f"Indexes ensured for {COLLECTION_NAME} collection")
            return True
        except Exception as e:
            logger.error(f"Failed to create {COLLECTION_NAME} indexes: {e}")
            return False

    async def create_or_get(
        self,
        user_id: str,
        filename: str,
        mime_type: str,
        kind: str,  # "pdf" | "image"
        size_bytes: int,
        content_hash: str,  # full sha256 hex of the ORIGINAL upload bytes
        pages: Optional[List[str]] = None,  # per-page extracted text (PDFs)
        page_count: int = 0,  # PDF page count — the in-window admission unit
        blob_bytes: Optional[bytes] = None,  # PDF original / image normalized render
    ) -> Dict[str, Any]:
        """Persist an upload's artifacts, deduping on (user_id, content_hash).

        blob_bytes is what replay re-sends in-window: the ORIGINAL bytes for a
        PDF (page-image fidelity must match turn 1), the NORMALIZED render for
        an image (turn 1 itself sends the normalized render). The hash covers
        the original bytes — dedupe keys on what the user re-uploads, and image
        normalization output could drift across Pillow versions.
        Returns {"attachment_id", "deduped"}.
        """
        existing = await self.collection.find_one(
            {"user_id": user_id, "content_hash": content_hash}, {"_id": 1}
        )
        if existing:
            logger.info(
                "Attachment deduped",
                user_id=user_id,
                attachment_id=str(existing["_id"]),
                filename=filename,
            )
            return {"attachment_id": str(existing["_id"]), "deduped": True}

        text_artifact = {
            "extracted_text": "",
            "text_extractable": False,
            "pages_kept": 0,
            "pages_dropped": 0,
        }
        if kind == "pdf" and pages is not None:
            text_artifact = prepare_pdf_text(pages)

        gridfs_id = None
        if blob_bytes is not None:
            gridfs_id = await self.bucket.upload_from_stream(
                filename, blob_bytes, metadata={"user_id": user_id}
            )

        doc = {
            "user_id": user_id,
            "filename": filename,
            "mime_type": mime_type,
            "kind": kind,
            "size_bytes": size_bytes,
            "content_hash": content_hash,
            **text_artifact,
            "page_count": page_count,
            "gridfs_id": gridfs_id,
            # Sweepable until a chat message actually references it.
            "expires_at": datetime.utcnow() + ORPHAN_TTL,
            "createdAt": datetime.utcnow(),
        }
        try:
            result = await self.collection.insert_one(doc)
        except Exception as e:
            # Unique-index race with a concurrent upload of the same file:
            # fall back to the winner's doc.
            if "duplicate key" in str(e).lower():
                winner = await self.collection.find_one(
                    {"user_id": user_id, "content_hash": content_hash}, {"_id": 1}
                )
                if winner:
                    if gridfs_id is not None:
                        await self.bucket.delete(gridfs_id)
                    return {"attachment_id": str(winner["_id"]), "deduped": True}
            raise

        logger.info(
            "Attachment persisted",
            user_id=user_id,
            attachment_id=str(result.inserted_id),
            filename=filename,
            kind=kind,
            pages_kept=text_artifact["pages_kept"],
            pages_dropped=text_artifact["pages_dropped"],
            text_extractable=text_artifact["text_extractable"],
            has_blob=gridfs_id is not None,
        )
        return {"attachment_id": str(result.inserted_id), "deduped": False}

    async def mark_sent(self, attachment_ids: List[str], user_id: str) -> None:
        """$unset expires_at on send — a referenced attachment must never sweep.

        Logs loudly on a zero-doc match: this is fire-and-forget from the chat
        path, and a silent miss would leave a SENT attachment sweepable — once
        the TTL index exists and the blob is an image's only copy, that is
        silent data loss.
        """
        oids = self._to_object_ids(attachment_ids)
        if not oids:
            return
        result = await self.collection.update_many(
            {"_id": {"$in": oids}, "user_id": user_id},
            {"$unset": {"expires_at": ""}},
        )
        if result.matched_count == 0:
            logger.error(
                "mark_sent matched zero attachment docs — sent attachment(s) remain sweepable",
                user_id=user_id,
                attachment_ids=attachment_ids,
            )

    async def get_many(
        self, attachment_ids: List[str], user_id: str
    ) -> Dict[str, Dict[str, Any]]:
        """Fetch attachment docs (no blob) keyed by string id, ownership-scoped."""
        oids = self._to_object_ids(attachment_ids)
        if not oids:
            return {}
        found = {}
        async for doc in self.collection.find({"_id": {"$in": oids}, "user_id": user_id}):
            found[str(doc["_id"])] = doc
        return found

    async def read_blob(self, gridfs_id) -> Optional[bytes]:
        """Read a normalized image render back for replay re-materialisation."""
        try:
            stream = await self.bucket.open_download_stream(gridfs_id)
            return await stream.read()
        except Exception as e:
            logger.error(f"Failed to read attachment blob {gridfs_id}: {e}")
            return None

    async def delete_for_conversation_cascade(
        self, attachment_ids: List[str], user_id: str, deleted_conversation_id: str
    ) -> None:
        """Refcount-by-query cascade for delete_conversation.

        Dedupe means one doc can back messages in several conversations, so
        drop doc + blob only when no OTHER conversation still references it.
        Known race, accepted: two concurrent deletes of conversations sharing
        an attachment can each see the other's reference and neither deletes —
        a benign orphan (recoverable via a manual admin sweep), preferred over
        distributed locking at this scale.
        """
        oids = self._to_object_ids(attachment_ids)
        for oid in oids:
            still_referenced = await self.db.chatConversations.count_documents(
                {
                    "metadata.user_id": user_id,
                    "conversation_id": {"$ne": deleted_conversation_id},
                    "messages.attachments.attachment_id": str(oid),
                },
                limit=1,
            )
            if still_referenced:
                logger.info(
                    "Attachment kept on cascade — still referenced elsewhere",
                    attachment_id=str(oid),
                )
                continue
            doc = await self.collection.find_one_and_delete(
                {"_id": oid, "user_id": user_id}
            )
            if doc and doc.get("gridfs_id") is not None:
                try:
                    await self.bucket.delete(doc["gridfs_id"])
                except Exception as e:
                    logger.error(f"Failed to delete attachment blob {doc['gridfs_id']}: {e}")
            logger.info("Attachment cascaded with conversation", attachment_id=str(oid))

    @staticmethod
    def _to_object_ids(attachment_ids: List[str]) -> List[ObjectId]:
        oids = []
        for aid in attachment_ids or []:
            try:
                oids.append(ObjectId(aid))
            except (InvalidId, TypeError):
                logger.warning(f"Ignoring invalid attachment_id: {aid!r}")
        return oids
