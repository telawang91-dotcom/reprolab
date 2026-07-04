from dataclasses import dataclass

from app.services.rag.parser import ParsedDoc

CHUNK_CHARS = 2000
OVERLAP_CHARS = 80


@dataclass(slots=True)
class TextChunk:
    content: str
    section: str | None
    position: int


def split(parsed: ParsedDoc) -> list[TextChunk]:
    chunks: list[TextChunk] = []
    for source in parsed.sections:
        text = source.text.strip()
        start = 0
        while start < len(text):
            end = min(start + CHUNK_CHARS, len(text))
            if end < len(text):
                boundary = text.rfind("\n", start + CHUNK_CHARS // 2, end)
                if boundary > start:
                    end = boundary
            content = text[start:end].strip()
            if content:
                chunks.append(TextChunk(content, source.section, source.position))
            if end >= len(text):
                break
            start = max(end - OVERLAP_CHARS, start + 1)
    return chunks

