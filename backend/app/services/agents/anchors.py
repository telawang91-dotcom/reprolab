import re
from dataclasses import dataclass

ANCHOR_PATTERN = re.compile(r"⟦(?P<kind>art|src)_(?P<code>[0-9a-fA-F]{4})⟧")
NUMBER_PATTERN = re.compile(
    r"(?<![A-Za-z0-9_.])[-+]?(?:\d{1,3}(?:,\d{3})+(?:\.\d*)?|\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?(?![A-Za-z0-9_.])"
)
BOUND_NUMBER_PATTERN = re.compile(
    r"(?P<number>[-+]?(?:\d{1,3}(?:,\d{3})+(?:\.\d*)?|\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)\s*(?P<anchor>⟦art_[0-9a-fA-F]{4}⟧)"
)


@dataclass(frozen=True, slots=True)
class AnchorRef:
    kind: str
    code: str
    raw: str
    start: int
    end: int


@dataclass(frozen=True, slots=True)
class NumberRef:
    value: float
    raw: str
    start: int
    end: int
    anchor: AnchorRef | None


def context_at(text: str, start: int, end: int, radius: int = 45) -> str:
    return text[max(0, start - radius) : min(len(text), end + radius)].replace("\n", " ")


def locate(text: str, start: int, end: int) -> str:
    return f"chars {start}:{end} · {context_at(text, start, end)}"


def extract_anchors(text: str) -> list[AnchorRef]:
    return [
        AnchorRef(match.group("kind"), match.group("code").lower(), match.group(0), match.start(), match.end())
        for match in ANCHOR_PATTERN.finditer(text)
    ]


def extract_numbers(text: str) -> list[NumberRef]:
    anchors = extract_anchors(text)
    anchor_spans = [(item.start, item.end) for item in anchors]
    bound: dict[tuple[int, int], AnchorRef] = {}
    for match in BOUND_NUMBER_PATTERN.finditer(text):
        anchor_match = ANCHOR_PATTERN.search(match.group("anchor"))
        if anchor_match:
            anchor_start = match.start("anchor")
            ref = AnchorRef("art", anchor_match.group("code").lower(), match.group("anchor"), anchor_start, match.end("anchor"))
            bound[(match.start("number"), match.end("number"))] = ref
    results: list[NumberRef] = []
    for match in NUMBER_PATTERN.finditer(text):
        span = (match.start(), match.end())
        if any(start <= span[0] and span[1] <= end for start, end in anchor_spans):
            continue
        line_start = text.rfind("\n", 0, span[0]) + 1
        if not text[line_start:span[0]].strip() and match.group().endswith("."):
            # Markdown ordered-list markers such as `1. **Finding**` are
            # structure, not research numbers requiring provenance.
            continue
        anchor = bound.get(span)
        if anchor is None:
            sentence_start = max(
                text.rfind(mark, 0, span[0]) for mark in ("。", "！", "？", "!", "?", "\n")
            ) + 1
            sentence_ends = [position for mark in ("。", "！", "？", "!", "?", "\n")
                             if (position := text.find(mark, span[1])) >= 0]
            sentence_end = min(sentence_ends) if sentence_ends else len(text)
            sentence_anchors = [
                item for item in anchors
                if item.kind == "art" and span[1] <= item.start < sentence_end
            ]
            unique = {item.code for item in sentence_anchors}
            if len(unique) == 1:
                anchor = sentence_anchors[0]
        results.append(NumberRef(float(match.group().replace(",", "")), match.group(), span[0], span[1], anchor))
    return results
