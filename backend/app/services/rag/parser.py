import io
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import fitz
import nbformat
import pandas as pd
from pandas.errors import ParserError


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


SUPPORTED_EXTENSIONS = {".pdf", ".csv", ".tsv", ".xlsx", ".py", ".ipynb", ".md", ".txt"}


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
    if not text.strip():
        raise ValueError("PDF 未识别到可检索文字；可能是扫描件。请先执行 OCR 或上传含文本层的 PDF。")
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


def _parse_csv(raw: bytes, separator: str = ",") -> pd.DataFrame:
    last_decode_error: UnicodeDecodeError | None = None
    for encoding in ("utf-8-sig", "gb18030"):
        try:
            return pd.read_csv(io.BytesIO(raw), encoding=encoding, sep=separator)
        except UnicodeDecodeError as exc:
            last_decode_error = exc
            continue
        except ParserError as exc:
            message = str(exc)
            match = re.search(
                r"Expected\s+(\d+)\s+fields?\s+in\s+line\s+(\d+),\s+saw\s+(\d+)",
                message,
                re.IGNORECASE,
            )
            if match:
                expected, line, actual = match.groups()
                raise ValueError(
                    f"CSV 格式不一致：第 {line} 行有 {actual} 列，表头应为 {expected} 列。"
                    "请检查该行是否有多余逗号或缺失引号，修正后重试；系统不会静默丢弃异常行。"
                ) from exc
            raise ValueError(f"CSV 无法解析：{message}") from exc
    raise ValueError(
        "CSV 文本编码无法识别；请另存为 UTF-8 或 GB18030 后重试。"
    ) from last_decode_error


def _parse_excel(raw: bytes) -> dict[str, Any]:
    try:
        sheets = pd.read_excel(io.BytesIO(raw), sheet_name=None)
    except Exception as exc:
        raise ValueError(f"Excel 无法解析：{exc}") from exc
    if not sheets:
        raise ValueError("Excel 工作簿中没有可读取的工作表")
    first_name, first_frame = next(iter(sheets.items()))
    schema = _dataset_schema(first_frame)
    schema["default_sheet"] = str(first_name)
    schema["sheets"] = [
        {"name": str(name), **_dataset_schema(frame)}
        for name, frame in sheets.items()
    ]
    return schema


def _decode_text(raw: bytes) -> str:
    last_error: UnicodeDecodeError | None = None
    for encoding in ("utf-8-sig", "gb18030"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError as exc:
            last_error = exc
    raise ValueError("文本编码无法识别；请另存为 UTF-8 或 GB18030 后重试。") from last_error


def read_dataset_frame(filename: str, raw: bytes, sheet: str | None = None) -> pd.DataFrame:
    """Read a supported table using the same strict decoding rules as ingestion."""
    extension = Path(filename).suffix.lower()
    if extension == ".csv":
        return _parse_csv(raw)
    if extension == ".tsv":
        return _parse_csv(raw, separator="\t")
    if extension == ".xlsx":
        try:
            return pd.read_excel(io.BytesIO(raw), sheet_name=sheet if sheet is not None else 0)
        except ValueError as exc:
            raise ValueError(f"Excel 工作表不存在或无法读取：{sheet or '默认工作表'}") from exc
        except Exception as exc:
            raise ValueError(f"Excel 无法解析：{exc}") from exc
    raise ValueError("只有 CSV、TSV 与 XLSX 支持结构化查询")


def parse(filename: str, raw: bytes) -> ParsedDoc:
    extension = Path(filename).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"unsupported file type: {extension or '<none>'}")
    if extension == ".pdf":
        return _parse_pdf(raw)
    if extension == ".csv":
        frame = _parse_csv(raw)
        return ParsedDoc(kind="dataset", dataset_schema=_dataset_schema(frame))
    if extension == ".tsv":
        frame = _parse_csv(raw, separator="\t")
        return ParsedDoc(kind="dataset", dataset_schema=_dataset_schema(frame))
    if extension == ".xlsx":
        return ParsedDoc(kind="dataset", dataset_schema=_parse_excel(raw))
    if extension == ".ipynb":
        return _parse_notebook(raw)
    text = _decode_text(raw)
    if not text.strip():
        raise ValueError("文件中没有可索引的文本内容")
    section = ParsedSection(text=text, section=None, position=0)
    return ParsedDoc(kind="text", text=text, sections=[section])
