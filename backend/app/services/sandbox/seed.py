import json


_RUNTIME_SOURCE = r'''
import os as _reprolab_os, random as _reprolab_random
from IPython.display import display as _reprolab_display

def _reprolab_is_number(value):
    try:
        float(value.strip())
        return True
    except (TypeError, ValueError):
        return False

def _reprolab_decode(raw):
    for encoding in ("utf-8-sig", "gb18030"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError("dataset text encoding is not UTF-8 or GB18030")

def _reprolab_delimiter(text):
    import csv as _reprolab_csv, io as _reprolab_io
    best = (1, ",")
    for candidate in (",", "\t", ";", "|"):
        try:
            rows = list(_reprolab_csv.reader(_reprolab_io.StringIO(text), delimiter=candidate))
        except _reprolab_csv.Error:
            continue
        width = max((len(row) for row in rows), default=1)
        if width > best[0]:
            best = (width, candidate)
    return best[1]

def _reprolab_paired_series(text, separator):
    import csv as _reprolab_csv, io as _reprolab_io
    import pandas as _reprolab_pd
    rows = list(_reprolab_csv.reader(_reprolab_io.StringIO(text), delimiter=separator))
    if len(rows) < 7:
        return None
    width = max((len(row) for row in rows), default=0)
    if width < 4 or width % 2:
        return None
    data_start = None
    for index, row in enumerate(rows):
        populated = [value.strip() for value in row if value.strip()]
        if len(row) == width and len(populated) > width // 2 and all(_reprolab_is_number(value) for value in populated):
            data_start = index
            break
    if data_start is None or data_start < 1 or len(rows) - data_start < 2:
        return None
    metadata_rows, data_rows = rows[:data_start], rows[data_start:]
    if any(len(row) not in {width, width - 1} for row in metadata_rows):
        return None
    if any(len(row) != width for row in data_rows):
        return None
    if any(not all(_reprolab_is_number(value) for value in row if value.strip()) for row in data_rows):
        return None
    labels = None
    for row in metadata_rows:
        padded = [*row, *([""] * (width - len(row)))]
        candidates = [padded[index].strip() for index in range(0, width, 2)]
        if all(not padded[index].strip() for index in range(1, width, 2)) and all(candidates) and all(not _reprolab_is_number(value) for value in candidates):
            labels = candidates
            break
    if labels is None:
        return None
    seen, columns, series = {}, [], []
    for label in labels:
        seen[label] = seen.get(label, 0) + 1
        unique = label if seen[label] == 1 else f"{label}_{seen[label]}"
        axis, intensity = f"{unique}_axis", f"{unique}_intensity"
        columns.extend([axis, intensity])
        series.append({"name": unique, "axis": axis, "intensity": intensity})
    values = [[float(value.strip()) if value.strip() else None for value in row] for row in data_rows]
    frame = _reprolab_pd.DataFrame(values, columns=columns)
    for item in series:
        paired_valid = frame[[item["axis"], item["intensity"]]].notna().all(axis=1)
        item["valid_point_count"] = int(paired_valid.sum())
        if paired_valid.any():
            first, last = paired_valid[paired_valid].index[0], paired_valid[paired_valid].index[-1]
            item["internal_gap_count"] = int((~paired_valid.loc[first:last]).sum())
        else:
            item["internal_gap_count"] = 0
    frame.attrs["reprolab_schema"] = {
        "source_format": "paired_series_csv",
        "series": series,
    }
    return frame

def _reprolab_read_delimited(path):
    import csv as _reprolab_csv, io as _reprolab_io
    import pandas as _reprolab_pd
    with open(path, "rb") as stream:
        raw = stream.read()
    text = _reprolab_decode(raw)
    separator = _reprolab_delimiter(text)
    rows = [
        (line, row)
        for line, row in enumerate(_reprolab_csv.reader(_reprolab_io.StringIO(text), delimiter=separator), start=1)
        if any(value.strip() for value in row)
    ]
    if rows:
        expected = len(rows[0][1])
        mismatch = next(((line, len(row)) for line, row in rows[1:] if len(row) != expected), None)
        if mismatch is not None:
            paired = _reprolab_paired_series(text, separator)
            if paired is not None:
                return paired
            line, actual = mismatch
            raise ValueError(f"dataset row {line} has {actual} columns; expected {expected}")
    return _reprolab_pd.read_csv(_reprolab_io.StringIO(text), sep=separator)

def load_dataset(index=0):
    # This is the complete public signature. Generated code must not pass parser
    # options: ingestion has already established the canonical table structure.
    if isinstance(index, bool) or not isinstance(index, int):
        raise TypeError("dataset index must be an integer")
    try:
        path = _reprolab_dataset_paths[index]
    except IndexError as error:
        raise IndexError(
            f"dataset index {index} is unavailable; selected dataset count: {len(_reprolab_dataset_paths)}"
        ) from error
    import pandas as _reprolab_pd
    with open(path, "rb") as stream:
        signature = stream.read(4)
    if signature.startswith(b"PK"):
        return _reprolab_pd.read_excel(path)
    return _reprolab_read_delimited(path)

def _reprolab_artifact_value(kind, value):
    if kind == "table":
        import json as _reprolab_json
        import pandas as _reprolab_pd
        if isinstance(value, _reprolab_pd.Series):
            value = value.to_frame()
        if isinstance(value, _reprolab_pd.DataFrame):
            # Pandas cannot JSON-encode PeriodIndex/MultiIndex values reliably
            # (some versions recurse until OverflowError).  Artifacts are an
            # interchange format, so normalize exotic axis/cell values before
            # serializing while preserving the visible table structure.
            frame = value.copy()
            def _axis_value(item):
                if isinstance(item, tuple):
                    return tuple(str(part) if isinstance(part, _reprolab_pd.Period) else part for part in item)
                return str(item) if isinstance(item, _reprolab_pd.Period) else item
            frame.index = [_axis_value(item) for item in frame.index]
            frame.columns = [_axis_value(item) for item in frame.columns]
            for column in frame.columns:
                series = frame[column]
                if isinstance(series.dtype, _reprolab_pd.PeriodDtype):
                    frame[column] = series.astype(str)
                elif series.dtype == "object":
                    frame[column] = series.map(
                        lambda item: str(item) if isinstance(item, _reprolab_pd.Period) else item
                    )
            return _reprolab_json.loads(frame.to_json(
                orient="split", force_ascii=False, date_format="iso", default_handler=str
            ))
    if hasattr(value, "item") and callable(value.item):
        try:
            return value.item()
        except (TypeError, ValueError):
            pass
    return value

class _ReproLabArtifact:
    def __init__(self, kind, value, title=None, tol=None):
        self.payload = {
            "kind": kind,
            "value": _reprolab_artifact_value(kind, value),
            "title": title,
            "tol": tol,
        }
    def _repr_mimebundle_(self, include=None, exclude=None):
        return {
            "application/vnd.reprolab.artifact+json": self.payload,
            "text/plain": repr(self.payload.get("value")),
        }

def emit_artifact(kind, value, title=None, tol=None):
    if kind not in {"number", "coefficient", "table", "figure", "text", "conclusion"}:
        raise ValueError("unsupported artifact kind")
    _reprolab_display(_ReproLabArtifact(kind, value, title, tol))

_reprolab_os.environ["PYTHONHASHSEED"] = str(SEED)
_reprolab_random.seed(SEED)
try:
    import numpy as _reprolab_np
    _reprolab_np.random.seed(SEED)
except ImportError:
    pass
try:
    get_ipython().run_line_magic("matplotlib", "inline")
except (NameError, ImportError):
    pass
try:
    import torch as _reprolab_torch
    _reprolab_torch.manual_seed(SEED)
except ImportError:
    pass
'''


def seed_prefix(seed: int | None, dataset_paths: list[str] | None = None) -> str:
    resolved = 42 if seed is None else seed
    paths = json.dumps(dataset_paths or [], ensure_ascii=False)
    return (
        f"SEED = {resolved!r}\n"
        f"_reprolab_dataset_paths = tuple({paths})\n"
        "DATASET_PATHS = _reprolab_dataset_paths\n"
        + _RUNTIME_SOURCE
    )
