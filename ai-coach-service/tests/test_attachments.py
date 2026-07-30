"""Tests for chat attachment persistence + replay: the pypdf text artifact,
image normalization, the turn-window replay plan (file in-window, text floor
out-of-window, honest line at the bottom), and title cleaning."""

import io

from unittest.mock import MagicMock

from PIL import Image

from app.core.agents.orchestrator import (
    REPLAY_ATTACHMENT_TEXT_BUDGET,
    REPLAY_ATTACHMENT_TURNS,
    REPLAY_PDF_PAGES_MAX,
    _attachment_parts_from_plan,
    _attachment_replay_plan,
    _history_to_openai_messages,
)
from app.services.attachment_service import (
    ATTACHMENT_TEXT_PERSIST_MAX_CHARS,
    normalize_image,
    prepare_pdf_text,
)
from app.services.conversation_service import ConversationService


# --- helpers --------------------------------------------------------------

def _human(content="hi", attachments=None):
    msg = {"role": "human", "content": content}
    if attachments is not None:
        msg["attachments"] = attachments
    return msg


def _ai(content="ok"):
    return {"role": "ai", "content": content}


def _ref(aid="a1", filename="plan.pdf", mime="application/pdf", kind="pdf"):
    return {"attachment_id": aid, "filename": filename, "mime_type": mime, "kind": kind}


def _doc(kind="pdf", text="x" * 500, extractable=True, pages=3, gridfs=True):
    return {
        "kind": kind,
        "mime_type": "application/pdf" if kind == "pdf" else "image/jpeg",
        "extracted_text": text if kind == "pdf" else "",
        "text_extractable": extractable if kind == "pdf" else False,
        "page_count": pages if kind == "pdf" else 0,
        "pages_kept": pages if kind == "pdf" else 0,
        "pages_dropped": 0,
        "gridfs_id": "gid" if gridfs else None,
    }


def _history_with_attachment(trailing_humans, attachments=None, ref=None):
    """One attached human turn followed by N plain human/ai exchanges."""
    history = [_human("here is my plan", attachments or [ref or _ref()]), _ai()]
    for i in range(trailing_humans):
        history.append(_human(f"follow-up {i}"))
        history.append(_ai())
    return history


# --- prepare_pdf_text -----------------------------------------------------

def test_pdf_text_page_delimited():
    result = prepare_pdf_text(["first page " * 30, "second page " * 30])
    assert result["pages_kept"] == 2
    assert result["pages_dropped"] == 0
    assert result["text_extractable"] is True
    assert "[page 1]" in result["extracted_text"]
    assert "[page 2]" in result["extracted_text"]


def test_pdf_text_truncates_at_page_boundary():
    page = "x" * 9_000
    pages = [page] * 10  # ~90k chars > 60k cap
    result = prepare_pdf_text(pages)
    assert result["pages_dropped"] > 0
    assert result["pages_kept"] + result["pages_dropped"] == 10
    assert len(result["extracted_text"]) <= ATTACHMENT_TEXT_PERSIST_MAX_CHARS
    # Page boundary: the artifact ends with a full page, not a mid-page slice
    assert result["extracted_text"].endswith(page)


def test_scanned_pdf_not_extractable():
    result = prepare_pdf_text(["", " ", ""])
    assert result["text_extractable"] is False
    assert result["pages_kept"] == 3  # empty pages are cheap, all kept


# --- normalize_image ------------------------------------------------------

def _jpeg_bytes(width, height, orientation=None):
    img = Image.new("RGB", (width, height), color=(120, 30, 30))
    out = io.BytesIO()
    kwargs = {"format": "JPEG"}
    if orientation is not None:
        exif = Image.Exif()
        exif[274] = orientation  # EXIF Orientation tag
        kwargs["exif"] = exif
    img.save(out, **kwargs)
    return out.getvalue()


def test_normalize_downscales_and_bakes_rotation():
    # Orientation 6 = 90° CW rotation needed: a 4000x2000 sensor image should
    # come out portrait (2000x4000 pre-scale) and capped at 1536 long edge.
    raw = _jpeg_bytes(4000, 2000, orientation=6)
    normalized, mime = normalize_image(raw, "image/jpeg")
    assert mime == "image/jpeg"
    img = Image.open(io.BytesIO(normalized))
    assert max(img.size) <= 1536
    assert img.height > img.width  # rotation baked in
    assert img.getexif().get(274) in (None, 1)  # orientation stripped/reset


def test_normalize_keeps_small_png_lossless():
    img = Image.new("RGB", (300, 200), color=(0, 200, 0))
    out = io.BytesIO()
    img.save(out, format="PNG")
    normalized, mime = normalize_image(out.getvalue(), "image/png")
    assert mime == "image/png"
    assert Image.open(io.BytesIO(normalized)).size == (300, 200)


def test_normalize_falls_back_on_garbage():
    normalized, mime = normalize_image(b"\x89PNG not really an image", "image/png")
    assert normalized == b"\x89PNG not really an image"
    assert mime == "image/png"


# --- replay plan: the representation rule ---------------------------------

def test_in_window_pdf_replays_as_file():
    history = _history_with_attachment(trailing_humans=2)
    plan = _attachment_replay_plan(history, {"a1": _doc()})
    assert [e["action"] for e in plan] == ["file"]

    parts = _attachment_parts_from_plan(plan, {"a1": b"%PDF-fake"})
    (part,) = parts[0]
    assert part["type"] == "file"
    assert part["file"]["filename"] == "plan.pdf"
    assert part["file"]["file_data"].startswith("data:application/pdf;base64,")


def test_window_slide_degrades_to_text_floor():
    """The composition guard: Stage 2's file path must NOT dead-code Stage 1's
    text floor — the turn the window slides past, the file becomes text."""
    inside = _history_with_attachment(trailing_humans=REPLAY_ATTACHMENT_TURNS - 1)
    outside = _history_with_attachment(trailing_humans=REPLAY_ATTACHMENT_TURNS)

    doc = _doc(text="Boulder Tech: 8 routes x 1 attempt")
    plan_in = _attachment_replay_plan(inside, {"a1": doc})
    plan_out = _attachment_replay_plan(outside, {"a1": doc})
    assert plan_in[0]["action"] == "file"
    assert plan_out[0]["action"] == "text"

    parts = _attachment_parts_from_plan(plan_out, {})
    (part,) = parts[0]
    assert part["type"] == "text"
    assert 'Attached file "plan.pdf"' in part["text"]
    assert "Boulder Tech" in part["text"]


def test_out_of_window_scanned_pdf_goes_straight_to_honest_line():
    history = _history_with_attachment(trailing_humans=REPLAY_ATTACHMENT_TURNS)
    doc = _doc(text="", extractable=False)
    plan = _attachment_replay_plan(history, {"a1": doc})
    assert plan[0]["action"] == "honest"

    parts = _attachment_parts_from_plan(plan, {})
    (part,) = parts[0]
    assert "no longer available" in part["text"]


def test_out_of_window_image_has_no_floor():
    ref = _ref(aid="img1", filename="form.jpg", mime="image/jpeg", kind="image")
    history = _history_with_attachment(trailing_humans=REPLAY_ATTACHMENT_TURNS, ref=ref)
    plan = _attachment_replay_plan(history, {"img1": _doc(kind="image")})
    assert plan[0]["action"] == "honest"


def test_in_window_image_replays_with_detail_high():
    ref = _ref(aid="img1", filename="form.jpg", mime="image/jpeg", kind="image")
    history = _history_with_attachment(trailing_humans=1, ref=ref)
    plan = _attachment_replay_plan(history, {"img1": _doc(kind="image")})
    parts = _attachment_parts_from_plan(plan, {"img1": b"\xff\xd8\xff fake"})
    (part,) = parts[0]
    assert part["type"] == "image_url"
    assert part["image_url"]["detail"] == "high"  # must match turn 1


def test_pdf_over_page_cap_falls_through_to_text():
    history = _history_with_attachment(trailing_humans=1)
    doc = _doc(pages=REPLAY_PDF_PAGES_MAX + 1)
    plan = _attachment_replay_plan(history, {"a1": doc})
    assert plan[0]["action"] == "text"


def test_missing_doc_is_honest():
    history = _history_with_attachment(trailing_humans=1)
    plan = _attachment_replay_plan(history, {})
    assert plan[0]["action"] == "honest"


def test_text_budget_drains_newest_first():
    big = "y" * (REPLAY_ATTACHMENT_TEXT_BUDGET - 100)
    history = [
        _human("old doc", [_ref(aid="old", filename="old.pdf")]), _ai(),
        _human("new doc", [_ref(aid="new", filename="new.pdf")]), _ai(),
    ]
    # Both out-of-window (append enough plain turns)
    for i in range(REPLAY_ATTACHMENT_TURNS):
        history.append(_human(f"f{i}"))
        history.append(_ai())
    docs = {"old": _doc(text=big), "new": _doc(text=big)}
    plan = _attachment_replay_plan(history, docs)
    by_id = {e["ref"]["attachment_id"]: e["action"] for e in plan}
    assert by_id["new"] == "text"      # newest wins the budget
    assert by_id["old"] == "honest"    # budget exhausted


def test_missing_blob_degrades_at_materialisation():
    history = _history_with_attachment(trailing_humans=1)
    plan = _attachment_replay_plan(history, {"a1": _doc()})
    assert plan[0]["action"] == "file"
    # Blob read failed → falls to the text floor, not an exception
    parts = _attachment_parts_from_plan(plan, {})
    (part,) = parts[0]
    assert part["type"] == "text"


# --- integration with _history_to_openai_messages -------------------------

def test_history_builds_multimodal_human_message():
    history = _history_with_attachment(trailing_humans=0)
    plan = _attachment_replay_plan(history, {"a1": _doc()})
    parts = _attachment_parts_from_plan(plan, {"a1": b"%PDF"})
    messages = _history_to_openai_messages(history, parts)
    assert isinstance(messages[0]["content"], list)
    assert messages[0]["content"][0] == {"type": "text", "text": "here is my plan"}
    assert messages[0]["content"][1]["type"] == "file"


def test_history_without_parts_is_unchanged():
    """Regression: plain histories keep the exact legacy shape."""
    history = [_human("hello"), _ai("hi")]
    assert _history_to_openai_messages(history) == [
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "hi"},
    ]
    assert _history_to_openai_messages(history, {}) == [
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "hi"},
    ]


# --- title cleaning -------------------------------------------------------

def _title(message):
    return ConversationService(MagicMock())._extract_clean_title(message)


def test_title_strips_attachment_marker():
    assert _title("[ATTACHMENT:FILE:workout plan.pdf]\nCan you add it?") == "Can you add it?"


def test_title_strips_attachment_marker_before_force_flags():
    # The marker was prepended OUTERMOST, shielding the force-flag regex
    assert _title("[ATTACHMENT:FILE:x.pdf]\n[WEB_SEARCH] hello") == "hello"


def test_title_attachment_only_message_falls_back():
    assert _title("[ATTACHMENT:IMAGE:pic.jpg]\n") == "New Conversation"


# --- the proxy whitelist (cross-repo guard) -------------------------------

def test_node_proxy_whitelist_forwards_attachment_ids():
    """The Node /ai/stream proxy reconstructs the request body from an
    explicit field whitelist — a new ChatRequest field that isn't listed there
    is silently dropped at the hop and the feature dies. The backend has no
    test runner, so this monorepo source assertion is the guard."""
    import pathlib

    ai_js = (
        pathlib.Path(__file__).resolve().parents[2] / "backend" / "src" / "routes" / "ai.js"
    )
    source = ai_js.read_text()
    assert "attachment_ids: req.body.attachment_ids" in source, (
        "attachment_ids missing from the Node proxy body whitelist "
        "(backend/src/routes/ai.js) — the field will be silently dropped"
    )
