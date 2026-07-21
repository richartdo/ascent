"""Deterministic, privacy-aware CV excerpt selection for local generation."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


CV_EXCERPT_MAX_CHARS = 450
_EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
_URL = re.compile(r"\b(?:https?://|www\.)\S+|\b(?:github|linkedin)\.com/\S+", re.IGNORECASE)
_PHONE = re.compile(r"(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)")
_WORDS = re.compile(r"[a-z][a-z0-9+#.-]{2,}", re.IGNORECASE)
_SPLIT = re.compile(r"(?:\r?\n)+|(?<=[.!?])\s+")
_GENERAL_MARKERS = re.compile(
    r"\b(?:summary|profile|skills?|experience|employment|projects?|education|awards?|achievements?|certifications?)\b",
    re.IGNORECASE,
)
_STOP_WORDS = {
    "and", "are", "for", "from", "have", "into", "that", "the", "their",
    "this", "with", "will", "your", "you", "our", "who", "all", "any",
    "opportunity", "applicant", "application", "required", "requirements",
}


@dataclass(frozen=True, slots=True)
class PreparedCv:
    text: str
    mode: str
    original_characters: int
    analyzed_characters: int


def prepare_cv_text(cv_text: str, opportunity: dict[str, Any] | None = None) -> PreparedCv:
    original_characters = len(cv_text)
    sanitized = _normalize(_redact_contacts(cv_text))
    if len(sanitized) <= CV_EXCERPT_MAX_CHARS:
        return PreparedCv(sanitized, "full", original_characters, len(sanitized))

    segments = _segments(sanitized)
    opportunity_terms = _opportunity_terms(opportunity)
    ranked = sorted(
        enumerate(segments),
        key=lambda item: (-_score(item[1], item[0], opportunity_terms), item[0]),
    )

    selected: list[tuple[int, str]] = []
    used = 0
    for index, segment in ranked:
        separator = 1 if selected else 0
        available = CV_EXCERPT_MAX_CHARS - used - separator
        if available <= 0:
            break
        if len(segment) > available:
            segment = segment[:available].rsplit(" ", 1)[0].strip()
        if segment:
            selected.append((index, segment))
            used += len(segment) + separator

    excerpt = "\n".join(value for _, value in sorted(selected))
    return PreparedCv(
        excerpt,
        "representative_excerpt",
        original_characters,
        len(excerpt),
    )


def _redact_contacts(text: str) -> str:
    return _PHONE.sub(" ", _URL.sub(" ", _EMAIL.sub(" ", text)))


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _segments(text: str) -> list[str]:
    initial = [part.strip() for part in _SPLIT.split(text) if part.strip()]
    segments: list[str] = []
    for part in initial:
        words = part.split()
        current: list[str] = []
        current_length = 0
        for word in words:
            if current and current_length + len(word) + 1 > 280:
                segments.append(" ".join(current))
                current = []
                current_length = 0
            current.append(word)
            current_length += len(word) + (1 if current_length else 0)
        if current:
            segments.append(" ".join(current))
    return segments or [text[:CV_EXCERPT_MAX_CHARS]]


def _opportunity_terms(opportunity: dict[str, Any] | None) -> set[str]:
    if not opportunity:
        return set()
    searchable = " ".join(
        str(value)
        for key in ("title", "type", "description", "requirements", "eligibility")
        for value in ([opportunity.get(key)] if not isinstance(opportunity.get(key), list) else opportunity.get(key, []))
        if value
    )
    return {word.lower() for word in _WORDS.findall(searchable) if word.lower() not in _STOP_WORDS}


def _score(segment: str, index: int, opportunity_terms: set[str]) -> int:
    words = {word.lower() for word in _WORDS.findall(segment)}
    score = len(words & opportunity_terms) * 5
    if _GENERAL_MARKERS.search(segment):
        score += 4
    if index == 0:
        score += 3
    if re.search(r"\b(?:built|created|developed|led|managed|designed|implemented|achieved|completed)\b", segment, re.IGNORECASE):
        score += 2
    return score
