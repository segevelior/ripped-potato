"""Content-fingerprint cache keys for LLM-backed endpoints.

A time TTL regenerates answers that would have been near-identical: the Today
dashboard's coach question burned an LLM call every 45 minutes even when nothing
about the athlete had changed. A fingerprint cache instead keys the cached answer
on a hash of everything that can change it — the assembled context, the prompt
TEXT, the model, and a coarse part-of-day bucket — so the answer is held until an
input actually moves.

Hashing the prompt text (not just the data) is deliberate: the classic bug in
this pattern is keying only on the context, so editing a prompt silently keeps
serving answers written by the OLD prompt. Here, editing a prompt changes every
key immediately, with no manual bump needed.

PROMPT_VERSION covers what the text does NOT: response parsing, validation,
token limits, the requested JSON shape.

This module is pure — no DB, no I/O — so other endpoints can adopt it without
inheriting the coach question's storage decisions.
"""

import hashlib
from datetime import datetime
from typing import Mapping, Optional, Sequence

# Bump when behaviour changes OUTSIDE the hashed text (parsing, validation,
# max_completion_tokens, response shape). Prompt EDITS need no bump — the prompt
# text is hashed directly.
PROMPT_VERSION = "1"

# Serialization/algorithm version — bump only if the hashing scheme itself
# changes (field order, separator, normalization rules).
_FINGERPRINT_VERSION = "fp1"

# Part-of-day buckets keyed on the user's LOCAL hour: [start, next start).
# Four 6h buckets rather than three: a three-way split gives "morning" a
# 00:00-11:59 span, so a question generated at 00:30 could still be served at
# 11:55. The local DATE is also in the key, so local midnight is a fifth,
# implicit, boundary.
DAY_PARTS = ((0, "night"), (6, "morning"), (12, "afternoon"), (18, "evening"))

# ASCII unit separator between hashed fields. Without it, ("ab", "c") and
# ("a", "bc") would produce the same digest.
_SEP = b"\x1f"


def part_of_day(local_now: datetime) -> str:
    """Coarse bucket for the user's local time. Total: never raises."""
    try:
        hour = int(local_now.hour)
    except Exception:
        return "unknown"
    label = DAY_PARTS[0][1]
    for start, name in DAY_PARTS:
        if hour >= start:
            label = name
    return label


def normalize_for_hash(text: str, volatile: Optional[Mapping[str, str]] = None) -> str:
    """Replace exact volatile substrings with stable placeholders.

    Exact-value replacement, never a regex: the caller passes the literal string
    it interpolated (e.g. the minute-precision local time), so this cannot
    accidentally scrub real athlete content the way a /\\d\\d:\\d\\d/ scrub would.
    """
    out = text or ""
    for name, value in (volatile or {}).items():
        if value:
            out = out.replace(str(value), f"<{name}>")
    return out.strip()


def fingerprint(
    *,
    context: str,
    prompts: Sequence[str] = (),
    model: str = "",
    parts: Sequence[str] = (),
    volatile: Optional[Mapping[str, str]] = None,
    prompt_version: Optional[str] = None,
) -> str:
    """SHA-256 hex digest of everything that can change the model's answer.

    context  - the assembled data context (normalized before hashing)
    prompts  - the prompt texts sent to the model (system + task prompt)
    model    - the model id; a model swap must invalidate
    parts    - scope/bucket fields: user id, local date, part of day, tuning
    volatile - literal substrings to neutralize (see normalize_for_hash)

    Total by construction: every field is coerced to str and encoded with
    errors="replace", so a caller cannot make this raise.
    """
    fields = [
        _FINGERPRINT_VERSION,
        # Module lookup at CALL time, not as a default arg: a default would bind
        # at import and be unpatchable in tests.
        prompt_version or PROMPT_VERSION,
        str(model),
        *[str(p) for p in parts],
        *[normalize_for_hash(str(p), volatile) for p in prompts],
        normalize_for_hash(str(context) if context is not None else "", volatile),
    ]
    digest = hashlib.sha256()
    for field in fields:
        digest.update(field.encode("utf-8", "replace"))
        digest.update(_SEP)
    return digest.hexdigest()
