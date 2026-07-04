import hashlib
import json

import fitz
import pandas as pd

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
