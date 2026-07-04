import io
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import fitz
import nbformat
import pandas as pd


@dataclass(slots=True)
class ParsedSection:
    text: str
    section: str | None
    position: int


@dataclass(slots=True)
class ParsedDoc:
    kind: str
    text: str = ""
    sections: list[ParsedSection] = field(default_factory=list)
    dataset_schema: dict[str, Any] | None = None


SUPPORTED_EXTENSIONS = {".pdf", ".csv", ".xlsx", ".py", ".ipynb", ".md", ".txt"}


def _dataset_schema(frame: pd.DataFrame) -> dict[str, Any]:
    return {
        "columns": [{"name": str(name), "dtype": str(dtype)} for name, dtype in frame.dtypes.items()],
        "row_count": int(len(frame)),
        "column_count": int(len(frame.columns)),
    }


def _parse_pdf(raw: bytes) -> ParsedDoc:
    sections: list[ParsedSection] = []
    with fitz.open(stream=raw, filetype="pdf") as document:
        for page_index, page in enumerate(document):
            page_text = page.get_text("text").strip()
            table_texts: list[str] = []
            try:
                tables = page.find_tables()
                for table in tables.tables:
                    extracted = table.extract()
                    if extracted:
                        header, *rows = extracted
                        table_texts.append(
                            "| " + " | ".join(str(value or "") for value in header) + " |\n"
                            + "| " + " | ".join("---" for _ in header) + " |\n"
                            + "\n".join("| " + " | ".join(str(value or "") for value in row) + " |" for row in rows)
                        )
            except (AttributeError, ValueError):
                pass
            combined = "\n\n".join(part for part in [page_text, *table_texts] if part)
            if combined:
                heading = next((line.strip() for line in page_text.splitlines() if 2 < len(line.strip()) < 100), None)
                sections.append(ParsedSection(combined, heading, page_index + 1))
    text = "\n\n".join(section.text for section in sections)
    return ParsedDoc(kind="text", text=text, sections=sections)


def _parse_notebook(raw: bytes) -> ParsedDoc:
    notebook = nbformat.reads(raw.decode("utf-8-sig"), as_version=4)
    sections: list[ParsedSection] = []
    current_heading: str | None = None
    for index, cell in enumerate(notebook.cells):
        source = cell.get("source", "").strip()
        if not source:
            continue
        if cell.cell_type == "markdown":
            heading_match = re.search(r"^#{1,6}\s+(.+)$", source, re.MULTILINE)
            if heading_match:
                current_heading = heading_match.group(1).strip()
        prefix = "```python\n" if cell.cell_type == "code" else ""
        suffix = "\n```" if cell.cell_type == "code" else ""
        sections.append(ParsedSection(prefix + source + suffix, current_heading, index))
    return ParsedDoc(kind="text", text="\n\n".join(item.text for item in sections), sections=sections)


def parse(filename: str, raw: bytes) -> ParsedDoc:
    extension = Path(filename).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"unsupported file type: {extension or '<none>'}")
    if extension == ".pdf":
        return _parse_pdf(raw)
    if extension == ".csv":
        frame = pd.read_csv(io.BytesIO(raw))
        return ParsedDoc(kind="dataset", dataset_schema=_dataset_schema(frame))
    if extension == ".xlsx":
        frame = pd.read_excel(io.BytesIO(raw))
        return ParsedDoc(kind="dataset", dataset_schema=_dataset_schema(frame))
    if extension == ".ipynb":
        return _parse_notebook(raw)
    text = raw.decode("utf-8-sig")
    section = ParsedSection(text=text, section=None, position=0)
    return ParsedDoc(kind="text", text=text, sections=[section])

