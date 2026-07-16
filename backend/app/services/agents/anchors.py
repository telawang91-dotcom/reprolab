import re
from dataclasses import dataclass

ANCHOR_PATTERN = re.compile(r"⟦(?P<kind>art|src)_(?P<code>[0-9a-fA-F]{4})⟧")
NUMBER_PATTERN = re.compile(
    r"(?<![A-Za-z0-9_.])[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?(?![A-Za-z0-9_.])"
)
BOUND_NUMBER_PATTERN = re.compile(
    r"(?P<number>[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)\s*(?P<anchor>⟦art_[0-9a-fA-F]{4}⟧)"
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
    anchor_spans = [(item.start, item.end) for item in extract_anchors(text)]
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
        results.append(NumberRef(float(match.group()), match.group(), span[0], span[1], bound.get(span)))
    return results
