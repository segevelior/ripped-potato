"""
Unit tests for the documents API endpoint.

Tests cover:
- File upload validation (magic bytes, size limits, page limits)
- Rate limiting
- Response format for OpenAI multimodal API
"""
import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException

from app.api.v1.documents import (
    validate_magic_bytes,
    upload_document,
    MAX_FILE_SIZE,
    MAX_PDF_PAGES,
    CHUNK_SIZE,
)
from app.core.rate_limiter import (
    check_rate_limit,
    _rate_limit_storage,
    _cleanup_expired_entries,
    DOCUMENT_UPLOAD_MAX_REQUESTS,
)


class TestValidateMagicBytes:
    """Tests for magic byte validation."""

    def test_valid_pdf(self):
        """PDF files should be detected correctly."""
        content = b"%PDF-1.4 some content"
        result = validate_magic_bytes(content)
        assert result == ("application/pdf", "pdf")

    def test_valid_png(self):
        """PNG files should be detected correctly."""
        content = b"\x89PNG\r\n\x1a\n some content"
        result = validate_magic_bytes(content)
        assert result == ("image/png", "image")

    def test_valid_jpeg(self):
        """JPEG files should be detected correctly."""
        content = b"\xff\xd8\xff\xe0 some content"
        result = validate_magic_bytes(content)
        assert result == ("image/jpeg", "image")

    def test_valid_gif87a(self):
        """GIF87a files should be detected correctly."""
        content = b"GIF87a some content"
        result = validate_magic_bytes(content)
        assert result == ("image/gif", "image")

    def test_valid_gif89a(self):
        """GIF89a files should be detected correctly."""
        content = b"GIF89a some content"
        result = validate_magic_bytes(content)
        assert result == ("image/gif", "image")

    def test_valid_webp(self):
        """WebP files should be detected correctly."""
        content = b"RIFF\x00\x00\x00\x00WEBP some content"
        result = validate_magic_bytes(content)
        assert result == ("image/webp", "image")

    def test_invalid_riff_not_webp(self):
        """RIFF files that aren't WebP should be rejected."""
        content = b"RIFF\x00\x00\x00\x00WAVE some content"  # WAV file
        result = validate_magic_bytes(content)
        assert result is None

    def test_invalid_file_type(self):
        """Unknown file types should return None."""
        content = b"unknown file content"
        result = validate_magic_bytes(content)
        assert result is None

    def test_empty_content(self):
        """Empty content should return None."""
        result = validate_magic_bytes(b"")
        assert result is None


class TestRateLimiter:
    """Tests for the rate limiter."""

    @pytest.fixture(autouse=True)
    def clear_storage(self):
        """Clear rate limit storage before each test."""
        _rate_limit_storage.clear()
        yield
        _rate_limit_storage.clear()

    def test_allows_requests_under_limit(self):
        """Requests under the limit should be allowed."""
        user_id = "test_user"

        # Should not raise for first 5 requests
        for _ in range(5):
            check_rate_limit(user_id, max_requests=5, window_seconds=3600)

    def test_blocks_requests_over_limit(self):
        """Requests over the limit should raise 429."""
        user_id = "test_user"

        # First 3 requests should succeed
        for _ in range(3):
            check_rate_limit(user_id, max_requests=3, window_seconds=3600)

        # 4th request should fail
        with pytest.raises(HTTPException) as exc_info:
            check_rate_limit(user_id, max_requests=3, window_seconds=3600)

        assert exc_info.value.status_code == 429
        assert "Rate limit exceeded" in exc_info.value.detail

    def test_different_users_have_separate_limits(self):
        """Each user should have their own rate limit."""
        # User 1 hits their limit
        for _ in range(3):
            check_rate_limit("user1", max_requests=3, window_seconds=3600)

        # User 1 is blocked
        with pytest.raises(HTTPException):
            check_rate_limit("user1", max_requests=3, window_seconds=3600)

        # User 2 should still work
        check_rate_limit("user2", max_requests=3, window_seconds=3600)

    def test_window_reset(self):
        """Rate limit should reset after window expires."""
        user_id = "test_user"
        key = f"rate_limit:document_upload:{user_id}"

        # Use up the limit
        for _ in range(3):
            check_rate_limit(user_id, max_requests=3, window_seconds=3600)

        # Simulate window expiration by modifying the stored timestamp
        count, _ = _rate_limit_storage[key]
        old_time = datetime.now(timezone.utc) - timedelta(hours=2)
        _rate_limit_storage[key] = (count, old_time)

        # Should work again after window reset
        check_rate_limit(user_id, max_requests=3, window_seconds=3600)

    def test_cleanup_removes_expired_entries(self):
        """Cleanup should remove old entries."""
        # Add some entries with old timestamps
        old_time = datetime.now(timezone.utc) - timedelta(hours=5)
        _rate_limit_storage["rate_limit:document_upload:old_user1"] = (5, old_time)
        _rate_limit_storage["rate_limit:document_upload:old_user2"] = (3, old_time)

        # Add a recent entry
        recent_time = datetime.now(timezone.utc)
        _rate_limit_storage["rate_limit:document_upload:recent_user"] = (1, recent_time)

        # Run cleanup
        _cleanup_expired_entries(window_seconds=3600)

        # Old entries should be removed
        assert "rate_limit:document_upload:old_user1" not in _rate_limit_storage
        assert "rate_limit:document_upload:old_user2" not in _rate_limit_storage

        # Recent entry should remain
        assert "rate_limit:document_upload:recent_user" in _rate_limit_storage


class TestUploadDocument:
    """Tests for the upload_document endpoint."""

    @pytest.fixture
    def mock_user(self):
        """Create a mock current user."""
        return {"user_id": "test_user", "email": "test@example.com"}

    @pytest.fixture(autouse=True)
    def clear_rate_limit(self):
        """Clear rate limit storage."""
        _rate_limit_storage.clear()
        yield
        _rate_limit_storage.clear()

    @pytest.mark.asyncio
    async def test_rejects_empty_file(self, mock_user):
        """Empty files should be rejected."""
        file = MagicMock()
        file.filename = "empty.pdf"
        file.content_type = "application/pdf"
        file.read = AsyncMock(return_value=b"")

        with pytest.raises(HTTPException) as exc_info:
            await upload_document(
                file=file,
                extraction_prompt="Extract info",
                current_user=mock_user,
            )

        assert exc_info.value.status_code == 400
        assert "empty" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_rejects_invalid_file_type(self, mock_user):
        """Files with invalid magic bytes should be rejected."""
        file = MagicMock()
        file.filename = "document.exe"
        file.content_type = "application/octet-stream"
        # Simulate chunked reading - first chunk has content, second returns empty
        file.read = AsyncMock(side_effect=[b"MZ\x90\x00 executable content", b""])

        with pytest.raises(HTTPException) as exc_info:
            await upload_document(
                file=file,
                extraction_prompt="Extract info",
                current_user=mock_user,
            )

        assert exc_info.value.status_code == 415
        assert "Unsupported file type" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_rejects_oversized_file(self, mock_user):
        """Files exceeding size limit should be rejected."""
        file = MagicMock()
        file.filename = "large.png"
        file.content_type = "image/png"

        # Simulate a file larger than MAX_FILE_SIZE
        chunk = b"\x89PNG" + (b"\x00" * CHUNK_SIZE)
        chunks_needed = (MAX_FILE_SIZE // CHUNK_SIZE) + 2

        call_count = [0]

        async def chunked_read(size):
            call_count[0] += 1
            if call_count[0] <= chunks_needed:
                return chunk
            return b""

        file.read = chunked_read

        with pytest.raises(HTTPException) as exc_info:
            await upload_document(
                file=file,
                extraction_prompt="Extract info",
                current_user=mock_user,
            )

        assert exc_info.value.status_code == 413
        assert "too large" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_successful_png_upload(self, mock_user):
        """Valid PNG upload should return correct structure."""
        png_content = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        file = MagicMock()
        file.filename = "image.png"
        file.content_type = "image/png"
        file.read = AsyncMock(side_effect=[png_content, b""])

        result = await upload_document(
            file=file,
            extraction_prompt="Analyze this image",
            current_user=mock_user,
        )

        assert result["success"] is True
        assert result["prompt"] == "Analyze this image"
        assert result["file_content"]["type"] == "image_url"
        assert "data:image/png;base64," in result["file_content"]["image_url"]["url"]
        assert result["metadata"]["filename"] == "image.png"
        assert result["metadata"]["mime_type"] == "image/png"

    @pytest.mark.asyncio
    async def test_successful_pdf_upload(self, mock_user):
        """Valid PDF upload should return correct structure."""
        # Create a minimal valid PDF
        pdf_content = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF"

        file = MagicMock()
        file.filename = "document.pdf"
        file.content_type = "application/pdf"
        file.read = AsyncMock(side_effect=[pdf_content, b""])

        result = await upload_document(
            file=file,
            extraction_prompt="Extract workout info",
            current_user=mock_user,
        )

        assert result["success"] is True
        assert result["prompt"] == "Extract workout info"
        assert result["file_content"]["type"] == "file"
        assert result["file_content"]["file"]["filename"] == "document.pdf"
        assert "data:application/pdf;base64," in result["file_content"]["file"]["file_data"]
        assert result["metadata"]["mime_type"] == "application/pdf"

    @pytest.mark.asyncio
    async def test_pdf_page_limit_rejection(self, mock_user):
        """PDFs exceeding page limit should be rejected."""
        # We'll mock the PdfReader to return more than MAX_PDF_PAGES
        pdf_content = b"%PDF-1.4 mock pdf content"
        file = MagicMock()
        file.filename = "large.pdf"
        file.content_type = "application/pdf"
        file.read = AsyncMock(side_effect=[pdf_content, b""])

        # Mock PdfReader to return too many pages
        mock_pages = MagicMock()
        mock_pages.__len__ = MagicMock(return_value=MAX_PDF_PAGES + 5)

        with patch("app.api.v1.documents.PdfReader") as mock_pdf_reader:
            mock_pdf_reader.return_value.pages = mock_pages

            with pytest.raises(HTTPException) as exc_info:
                await upload_document(
                    file=file,
                    extraction_prompt="Extract info",
                    current_user=mock_user,
                )

            assert exc_info.value.status_code == 400
            assert f"{MAX_PDF_PAGES}" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_corrupted_pdf_rejection(self, mock_user):
        """Corrupted PDFs should be rejected."""
        pdf_content = b"%PDF-1.4 corrupted content without proper structure"
        file = MagicMock()
        file.filename = "corrupted.pdf"
        file.content_type = "application/pdf"
        file.read = AsyncMock(side_effect=[pdf_content, b""])

        # Mock PdfReader to raise PdfReadError
        with patch("app.api.v1.documents.PdfReader") as mock_pdf_reader:
            from pypdf.errors import PdfReadError
            mock_pdf_reader.side_effect = PdfReadError("Invalid PDF")

            with pytest.raises(HTTPException) as exc_info:
                await upload_document(
                    file=file,
                    extraction_prompt="Extract info",
                    current_user=mock_user,
                )

            assert exc_info.value.status_code == 400
            assert "Invalid or corrupted PDF" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_jpeg_upload(self, mock_user):
        """Valid JPEG upload should work correctly."""
        jpeg_content = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 100
        file = MagicMock()
        file.filename = "photo.jpg"
        file.content_type = "image/jpeg"
        file.read = AsyncMock(side_effect=[jpeg_content, b""])

        result = await upload_document(
            file=file,
            extraction_prompt="Analyze progress photo",
            current_user=mock_user,
        )

        assert result["success"] is True
        assert result["file_content"]["type"] == "image_url"
        assert result["metadata"]["mime_type"] == "image/jpeg"

    @pytest.mark.asyncio
    async def test_gif_upload(self, mock_user):
        """Valid GIF upload should work correctly."""
        gif_content = b"GIF89a" + b"\x00" * 100
        file = MagicMock()
        file.filename = "animation.gif"
        file.content_type = "image/gif"
        file.read = AsyncMock(side_effect=[gif_content, b""])

        result = await upload_document(
            file=file,
            extraction_prompt="Analyze form",
            current_user=mock_user,
        )

        assert result["success"] is True
        assert result["file_content"]["type"] == "image_url"
        assert result["metadata"]["mime_type"] == "image/gif"

    @pytest.mark.asyncio
    async def test_webp_upload(self, mock_user):
        """Valid WebP upload should work correctly."""
        webp_content = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 100
        file = MagicMock()
        file.filename = "image.webp"
        file.content_type = "image/webp"
        file.read = AsyncMock(side_effect=[webp_content, b""])

        result = await upload_document(
            file=file,
            extraction_prompt="Analyze image",
            current_user=mock_user,
        )

        assert result["success"] is True
        assert result["file_content"]["type"] == "image_url"
        assert result["metadata"]["mime_type"] == "image/webp"

    @pytest.mark.asyncio
    async def test_content_hash_generated(self, mock_user):
        """Response should include content hash."""
        png_content = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        file = MagicMock()
        file.filename = "image.png"
        file.content_type = "image/png"
        file.read = AsyncMock(side_effect=[png_content, b""])

        result = await upload_document(
            file=file,
            extraction_prompt="Test",
            current_user=mock_user,
        )

        assert "content_hash" in result["metadata"]
        assert len(result["metadata"]["content_hash"]) == 16  # First 16 chars of SHA256

    @pytest.mark.asyncio
    async def test_file_size_tracked(self, mock_user):
        """Response should include accurate file size."""
        png_content = b"\x89PNG\r\n\x1a\n" + b"\x00" * 500
        file = MagicMock()
        file.filename = "image.png"
        file.content_type = "image/png"
        file.read = AsyncMock(side_effect=[png_content, b""])

        result = await upload_document(
            file=file,
            extraction_prompt="Test",
            current_user=mock_user,
        )

        assert result["metadata"]["size_bytes"] == len(png_content)

    @pytest.mark.asyncio
    async def test_rate_limit_enforced(self, mock_user):
        """Rate limit should be enforced per user."""
        png_content = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100

        # Exhaust rate limit
        for i in range(DOCUMENT_UPLOAD_MAX_REQUESTS):
            file = MagicMock()
            file.filename = f"image{i}.png"
            file.content_type = "image/png"
            file.read = AsyncMock(side_effect=[png_content, b""])

            await upload_document(
                file=file,
                extraction_prompt="Test",
                current_user=mock_user,
            )

        # Next request should be rate limited
        file = MagicMock()
        file.filename = "one_more.png"
        file.content_type = "image/png"
        file.read = AsyncMock(side_effect=[png_content, b""])

        with pytest.raises(HTTPException) as exc_info:
            await upload_document(
                file=file,
                extraction_prompt="Test",
                current_user=mock_user,
            )

        assert exc_info.value.status_code == 429
