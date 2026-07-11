"""
Small, pure text helpers for the coach's response pipeline.

`dedupe_repeated_response` is a safety net for a specific gpt-5.4-mini failure
mode: under the large system prompt the model sometimes emits its ENTIRE reply
twice back-to-back (observed on the opening turn — "…run right now?\n…run right
now?"). We collapse that exact full-duplication deterministically rather than
letting it stream and persist doubled. Deliberately conservative: it only fires
when the message body is two (near-)identical halves, so legitimately repetitive
content (a plan listing the same exercise across weeks) is never touched.
"""

import re

# Trailing structured blocks the model appends AFTER the (duplicated) prose —
# these are the unique tail and must be preserved, not folded into the halves.
_TAIL_RE = re.compile(r"(\n*<(?:quick-replies|video-embed|action-button)\b[\s\S]*)$", re.IGNORECASE)

# Don't attempt on long messages (real programs/plans) — the doubling is a
# conversational-reply failure; long structured answers don't exhibit it and we
# won't risk a false collapse.
_MAX_BODY = 4000
_MIN_HALF = 20


def _collapse_exact_double(body: str) -> str:
    """If `body` is two identical halves separated only by whitespace, return one
    half; else return body unchanged."""
    b = body.strip()
    n = len(b)
    if n < 2 * _MIN_HALF or n > _MAX_BODY:
        return body
    mid = n // 2
    # The separator between copies is whitespace (often a single "\n"), so the
    # split point sits within a few chars of the midpoint — scan a small window.
    for i in range(mid - 3, mid + 4):
        if i <= 0 or i >= n:
            continue
        left, right = b[:i].strip(), b[i:].strip()
        if len(left) >= _MIN_HALF and left == right:
            return left
    return body


def dedupe_repeated_response(text: str) -> str:
    """Collapse a fully-duplicated reply to a single copy. Preserves any trailing
    quick-replies/video-embed/action-button block. No-op for normal text."""
    if not text:
        return text
    m = _TAIL_RE.search(text)
    tail = text[m.start():] if m else ""
    body = text[: m.start()] if m else text

    collapsed = _collapse_exact_double(body)
    if collapsed == body:
        return text  # nothing to do

    tail = tail.strip()
    return collapsed + ("\n\n" + tail if tail else "")
