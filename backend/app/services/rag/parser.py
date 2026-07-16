import csv
import io
import json
import re
import zipfile
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

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
    metadata: dict[str, Any] = field(default_factory=dict)


TABLE_EXTENSIONS = {".csv", ".tsv", ".xlsx"}


def _dataset_schema(frame: pd.DataFrame) -> dict[str, Any]:
    schema = {
        "columns": [{"name": str(name), "dtype": str(dtype)} for name, dtype in frame.dtypes.items()],
        "row_count": int(len(frame)),
        "column_count": int(len(frame.columns)),
    }
    parser_metadata = frame.attrs.get("reprolab_schema")
    if isinstance(parser_metadata, dict):
        schema.update(parser_metadata)
    return schema


def _is_number(value: str) -> bool:
    try:
        float(value.strip())
        return True
    except (TypeError, ValueError):
        return False


def _paired_series_frame(raw: bytes, encoding: str, separator: str) -> pd.DataFrame | None:
    """Recognize strict multi-header exports containing adjacent axis/value series."""
    try:
        rows = list(csv.reader(io.StringIO(raw.decode(encoding)), delimiter=separator))
    except (UnicodeDecodeError, csv.Error):
        return None
    if len(rows) < 7:
        return None
    width = max((len(row) for row in rows), default=0)
    if width < 4 or width % 2:
        return None

    data_start: int | None = None
    for index, row in enumerate(rows):
        populated = [value.strip() for value in row if value.strip()]
        if (
            len(row) == width
            and len(populated) > width // 2
            and all(_is_number(value) for value in populated)
        ):
            data_start = index
            break
    if data_start is None or data_start < 1 or len(rows) - data_start < 2:
        return None

    metadata_rows = rows[:data_start]
    data_rows = rows[data_start:]
    if any(len(row) not in {width, width - 1} for row in metadata_rows):
        return None
    if any(len(row) != width for row in data_rows):
        return None
    if any(
        not all(_is_number(value) for value in row if value.strip())
        for row in data_rows
    ):
        return None

    label_row: list[str] | None = None
    for row in metadata_rows:
        padded = [*row, *([""] * (width - len(row)))]
        labels = [padded[index].strip() for index in range(0, width, 2)]
        paired_blanks = all(not padded[index].strip() for index in range(1, width, 2))
        if paired_blanks and all(labels) and all(not _is_number(label) for label in labels):
            label_row = labels
            break
    if label_row is None:
        return None

    seen: dict[str, int] = {}
    series: list[dict[str, Any]] = []
    columns: list[str] = []
    for label in label_row:
        seen[label] = seen.get(label, 0) + 1
        unique_label = label if seen[label] == 1 else f"{label}_{seen[label]}"
        axis = f"{unique_label}_axis"
        intensity = f"{unique_label}_intensity"
        columns.extend([axis, intensity])
        series.append({"name": unique_label, "axis": axis, "intensity": intensity})

    values = [
        [float(value.strip()) if value.strip() else None for value in row]
        for row in data_rows
    ]
    frame = pd.DataFrame(values, columns=columns)
    for item in series:
        axis, intensity = str(item["axis"]), str(item["intensity"])
        paired_valid = frame[[axis, intensity]].notna().all(axis=1)
        item["valid_point_count"] = int(paired_valid.sum())
        if paired_valid.any():
            first = int(paired_valid[paired_valid].index[0])
            last = int(paired_valid[paired_valid].index[-1])
            item["internal_gap_count"] = int((~paired_valid.loc[first:last]).sum())
        else:
            item["internal_gap_count"] = 0
    frame.attrs["reprolab_schema"] = {
        "source_format": "paired_series_csv",
        "header_rows": data_start,
        "series": series,
    }
    return frame


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
            decoded = raw.decode(encoding)
        except UnicodeDecodeError as exc:
            last_decode_error = exc
            continue
        try:
            rows = [
                (line, row)
                for line, row in enumerate(csv.reader(io.StringIO(decoded), delimiter=separator), start=1)
                if any(value.strip() for value in row)
            ]
        except csv.Error as exc:
            raise ValueError(f"CSV 无法解析：{exc}") from exc
        if rows:
            expected = len(rows[0][1])
            mismatch = next(((line, len(row)) for line, row in rows[1:] if len(row) != expected), None)
            if mismatch is not None:
                paired_frame = _paired_series_frame(raw, encoding, separator)
                if paired_frame is not None:
                    return paired_frame
                line, actual = mismatch
                raise ValueError(
                    f"CSV 格式不一致：第 {line} 行有 {actual} 列，表头应为 {expected} 列。"
                    "请检查该行是否有多余分隔符或缺失引号，修正后重试；系统不会静默丢弃异常行。"
                )
        try:
            return pd.read_csv(io.BytesIO(raw), encoding=encoding, sep=separator)
        except ParserError as exc:
            paired_frame = _paired_series_frame(raw, encoding, separator)
            if paired_frame is not None:
                return paired_frame
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


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        value = data.strip()
        if value:
            self.parts.append(value)


def _looks_like_text(text: str) -> bool:
    if not text:
        return False
    sample = text[:20_000]
    if "\x00" in sample:
        return False
    controls = sum(ord(char) < 32 and char not in "\n\r\t\f\b" for char in sample)
    return controls / max(len(sample), 1) < 0.02


def _sniff_delimiter(text: str) -> str | None:
    lines = [line for line in text.splitlines() if line.strip()][:40]
    if len(lines) < 2:
        return None
    sample = "\n".join(lines)
    try:
        delimiter = csv.Sniffer().sniff(sample, delimiters=",\t;|").delimiter
    except csv.Error:
        return None
    widths: list[int] = []
    try:
        for row in csv.reader(io.StringIO(sample), delimiter=delimiter):
            widths.append(len(row))
    except csv.Error:
        return None
    if not widths or min(widths) < 2 or len(set(widths)) != 1:
        return None
    return delimiter


def _parse_generic_table(raw: bytes, text: str) -> pd.DataFrame | None:
    delimiter = _sniff_delimiter(text)
    if delimiter is None:
        return None
    frame = _parse_csv(raw, separator=delimiter)
    if len(frame.columns) < 2:
        return None
    frame.attrs["reprolab_schema"] = {
        **frame.attrs.get("reprolab_schema", {}),
        "source_format": "delimited_text",
        "delimiter": delimiter,
    }
    return frame


def _archive_members(raw: bytes) -> set[str]:
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            return set(archive.namelist())
    except (zipfile.BadZipFile, OSError):
        return set()


def _parse_office_text(raw: bytes, kind: str) -> ParsedDoc:
    sections: list[ParsedSection] = []
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            if kind == "docx":
                names = sorted(
                    name for name in archive.namelist()
                    if name == "word/document.xml"
                    or re.fullmatch(r"word/(header|footer)\d+\.xml", name)
                )
            else:
                names = sorted(
                    (name for name in archive.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)),
                    key=lambda name: int(re.search(r"(\d+)", Path(name).stem).group(1)),
                )
            for position, name in enumerate(names, start=1):
                root = ElementTree.fromstring(archive.read(name))
                values = [node.text.strip() for node in root.iter() if node.tag.endswith("}t") and node.text and node.text.strip()]
                if values:
                    sections.append(ParsedSection("\n".join(values), Path(name).stem, position))
    except (zipfile.BadZipFile, ElementTree.ParseError, KeyError) as exc:
        raise ValueError(f"{kind.upper()} 无法解析：{exc}") from exc
    text = "\n\n".join(section.text for section in sections)
    if not text:
        raise ValueError(f"{kind.upper()} 中没有可索引的文本内容")
    return ParsedDoc(
        kind="text",
        text=text,
        sections=sections,
        metadata={"parse_status": "indexed", "parser": kind},
    )


def _parse_json_text(raw: bytes, json_lines: bool = False) -> ParsedDoc:
    text = _decode_text(raw)
    try:
        value = [json.loads(line) for line in text.splitlines() if line.strip()] if json_lines else json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"JSON 无法解析：第 {exc.lineno} 行第 {exc.colno} 列") from exc
    rendered = json.dumps(value, ensure_ascii=False, indent=2)
    return ParsedDoc(
        kind="text",
        text=rendered,
        sections=[ParsedSection(rendered, None, 0)],
        metadata={"parse_status": "indexed", "parser": "json"},
    )


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
    text = _decode_text(raw)
    frame = _parse_generic_table(raw, text)
    if frame is not None:
        return frame
    raise ValueError("该文件未识别为可结构化查询的数据表")


def parse(filename: str, raw: bytes) -> ParsedDoc:
    extension = Path(filename).suffix.lower()
    if raw.startswith(b"%PDF") or extension == ".pdf":
        parsed = _parse_pdf(raw)
        parsed.metadata.update({"parse_status": "indexed", "parser": "pdf"})
        return parsed
    if extension == ".csv":
        frame = _parse_csv(raw)
        return ParsedDoc(kind="dataset", dataset_schema=_dataset_schema(frame), metadata={"parse_status": "structured", "parser": "csv"})
    if extension == ".tsv":
        frame = _parse_csv(raw, separator="\t")
        return ParsedDoc(kind="dataset", dataset_schema=_dataset_schema(frame), metadata={"parse_status": "structured", "parser": "tsv"})

    members = _archive_members(raw) if raw.startswith(b"PK") else set()
    if extension == ".xlsx" or "xl/workbook.xml" in members:
        return ParsedDoc(kind="dataset", dataset_schema=_parse_excel(raw), metadata={"parse_status": "structured", "parser": "xlsx"})
    if extension == ".docx" or "word/document.xml" in members:
        return _parse_office_text(raw, "docx")
    if extension == ".pptx" or "ppt/presentation.xml" in members:
        return _parse_office_text(raw, "pptx")
    if extension == ".ipynb":
        parsed = _parse_notebook(raw)
        parsed.metadata.update({"parse_status": "indexed", "parser": "notebook"})
        return parsed
    if extension in {".json", ".jsonl"}:
        return _parse_json_text(raw, json_lines=extension == ".jsonl")

    try:
        text = _decode_text(raw)
    except ValueError:
        return ParsedDoc(
            kind="binary",
            metadata={
                "parse_status": "stored",
                "parser": "binary",
                "message": "原始文件已保存；当前没有可提取的文本，仍可作为研究资料管理和后续调用。",
            },
        )
    if not _looks_like_text(text):
        return ParsedDoc(
            kind="binary",
            metadata={
                "parse_status": "stored",
                "parser": "binary",
                "message": "原始文件已保存；当前没有可提取的文本，仍可作为研究资料管理和后续调用。",
            },
        )
    if not text.strip():
        raise ValueError("文件中没有可索引的文本内容")
    if extension in {".html", ".htm"}:
        extractor = _TextExtractor()
        extractor.feed(text)
        text = "\n".join(extractor.parts)
    generic_table = _parse_generic_table(raw, text)
    if generic_table is not None:
        return ParsedDoc(
            kind="dataset",
            dataset_schema=_dataset_schema(generic_table),
            metadata={"parse_status": "structured", "parser": "delimited_text"},
        )
    section = ParsedSection(text=text, section=None, position=0)
    return ParsedDoc(
        kind="text",
        text=text,
        sections=[section],
        metadata={"parse_status": "indexed", "parser": "text"},
    )
