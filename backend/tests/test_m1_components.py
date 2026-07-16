import hashlib
import io
import json

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


def test_csv_parser_accepts_common_gb18030_encoding():
    raw = "姓名,数值\n样本甲,1\n".encode("gb18030")
    parsed = parser.parse("中文数据.csv", raw)
    assert parsed.dataset_schema["row_count"] == 1
    assert parsed.dataset_schema["columns"][0]["name"] == "姓名"


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
