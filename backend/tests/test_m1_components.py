import hashlib
import io
import json
import zipfile

import fitz
import pandas as pd
import pytest

from app.core.config import settings
from app.services.rag import chunker, parser, storage


def test_storage_is_content_addressed_and_idempotent(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_dir", tmp_path)
    data = b"reproducible research"
    expected = hashlib.sha256(data).hexdigest()
    assert storage.save_bytes(data) == expected
    assert storage.save_bytes(data) == expected
    assert [item.name for item in tmp_path.iterdir()] == [expected]
    assert storage.read_bytes(expected) == data


def test_csv_parser_extracts_complete_schema():
    frame = pd.DataFrame({"species": ["A"] * 10, "mass": range(10), "valid": [True] * 10})
    raw = frame.to_csv(index=False).encode()
    parsed = parser.parse("penguins.csv", raw)
    assert parsed.kind == "dataset"
    assert parsed.dataset_schema["row_count"] == 10
    assert parsed.dataset_schema["column_count"] == 3
    assert [column["name"] for column in parsed.dataset_schema["columns"]] == ["species", "mass", "valid"]


def test_csv_parser_reports_inconsistent_row_without_silently_dropping_it():
    raw = b"a,b,c\n1,2,3\n4,5,6,7\n"
    with pytest.raises(ValueError) as caught:
        parser.parse("broken.csv", raw)
    message = str(caught.value)
    assert "第 3 行有 4 列" in message
    assert "表头应为 3 列" in message
    assert "不会静默丢弃" in message


def test_csv_parser_does_not_let_pandas_infer_an_extra_field_as_an_index():
    with pytest.raises(ValueError, match="第 2 行有 3 列"):
        parser.parse("broken.csv", b"a,b\n1,2,3\n")


def test_csv_parser_accepts_common_gb18030_encoding():
    raw = "姓名,数值\n样本甲,1\n".encode("gb18030")
    parsed = parser.parse("中文数据.csv", raw)
    assert parsed.dataset_schema["row_count"] == 1
    assert parsed.dataset_schema["columns"][0]["name"] == "姓名"


def test_csv_parser_normalizes_unambiguous_paired_instrument_series():
    raw = (
        "1,,1\n"
        " ,, \n"
        "Su1s,,C1s\n"
        "1,,1\n"
        "1200.0,147562.5,297.0,57934.4\n"
        "1199.2,148112.5,296.9,58065.6\n"
        "1198.4,146575.0,296.8,58382.8\n"
    ).encode()
    frame = parser.read_dataset_frame("xps.csv", raw)
    parsed = parser.parse("xps.csv", raw)
    assert list(frame.columns) == [
        "Su1s_axis", "Su1s_intensity", "C1s_axis", "C1s_intensity",
    ]
    assert frame.shape == (3, 4)
    assert frame.iloc[0].tolist() == [1200.0, 147562.5, 297.0, 57934.4]
    assert parsed.dataset_schema["source_format"] == "paired_series_csv"
    assert parsed.dataset_schema["header_rows"] == 4
    assert parsed.dataset_schema["series"][1]["name"] == "C1s"


def test_tsv_and_multi_sheet_excel_expose_complete_dataset_structure():
    tsv = parser.parse("measurements.tsv", b"sample\tvalue\nA\t1\nB\t2\n")
    assert tsv.dataset_schema["row_count"] == 2
    assert [item["name"] for item in tsv.dataset_schema["columns"]] == ["sample", "value"]

    stream = io.BytesIO()
    with pd.ExcelWriter(stream, engine="openpyxl") as writer:
        pd.DataFrame({"sample": ["A", "B"], "value": [1, 2]}).to_excel(
            writer, sheet_name="raw", index=False
        )
        pd.DataFrame({"metric": ["mean"], "value": [1.5]}).to_excel(
            writer, sheet_name="summary", index=False
        )
    workbook = parser.parse("study.xlsx", stream.getvalue())
    assert workbook.dataset_schema["default_sheet"] == "raw"
    assert [item["name"] for item in workbook.dataset_schema["sheets"]] == ["raw", "summary"]


def test_scanned_pdf_is_not_reported_as_successful_text_ingest():
    document = fitz.open()
    document.new_page()
    raw = document.tobytes()
    document.close()
    with pytest.raises(ValueError, match="OCR"):
        parser.parse("scan.pdf", raw)


def test_notebook_and_markdown_are_chunked():
    notebook = {
        "nbformat": 4,
        "nbformat_minor": 5,
        "metadata": {},
        "cells": [
            {"id": "markdown-cell", "cell_type": "markdown", "metadata": {}, "source": ["# Analysis\n", "Notes"]},
            {"id": "code-cell", "cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": ["print(42)"]},
        ],
    }
    parsed_notebook = parser.parse("analysis.ipynb", json.dumps(notebook).encode())
    parsed_markdown = parser.parse("notes.md", b"# Notes\n" + b"evidence " * 400)
    assert "```python" in parsed_notebook.text
    assert chunker.split(parsed_notebook)
    assert len(chunker.split(parsed_markdown)) >= 2


def test_plain_text_accepts_gb18030_and_rejects_empty_content():
    assert "实验记录" in parser.parse("notes.md", "实验记录".encode("gb18030")).text
    with pytest.raises(ValueError, match="没有可索引"):
        parser.parse("empty.txt", b" \n")


def test_content_detection_accepts_extensionless_tables_and_arbitrary_binary():
    table = parser.parse("instrument-output", b"sample;value\nA;1\nB;2\n")
    binary = parser.parse("vendor-format.raw", b"\x00\x01\x02\xff")
    assert table.kind == "dataset"
    assert table.dataset_schema["delimiter"] == ";"
    assert table.metadata["parse_status"] == "structured"
    assert binary.kind == "binary"
    assert binary.metadata["parse_status"] == "stored"


def test_docx_text_is_detected_by_content_even_with_unknown_extension():
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("word/document.xml", """<?xml version="1.0" encoding="UTF-8"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body><w:p><w:r><w:t>可复现研究记录</w:t></w:r></w:p></w:body>
        </w:document>""")
    parsed = parser.parse("renamed.payload", stream.getvalue())
    assert parsed.kind == "text"
    assert "可复现研究记录" in parsed.text
    assert parsed.metadata["parser"] == "docx"


def test_three_page_pdf_extracts_text_and_positions():
    document = fitz.open()
    for page_number in range(1, 4):
        page = document.new_page()
        page.insert_text((72, 72), f"Study title 2024\nPage {page_number} reproducible evidence")
    raw = document.tobytes()
    document.close()
    parsed = parser.parse("study.pdf", raw)
    assert len(parsed.sections) == 3
    assert [section.position for section in parsed.sections] == [1, 2, 3]
    assert len(chunker.split(parsed)) == 3
