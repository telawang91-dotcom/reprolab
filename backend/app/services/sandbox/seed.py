import json


def seed_prefix(seed: int | None, dataset_paths: list[str] | None = None) -> str:
    resolved = 42 if seed is None else seed
    paths = json.dumps(dataset_paths or [], ensure_ascii=False)
    return f"""SEED = {resolved!r}
_reprolab_dataset_paths = tuple({paths})
DATASET_PATHS = _reprolab_dataset_paths
import os as _reprolab_os, random as _reprolab_random
from IPython.display import display as _reprolab_display
def load_dataset(index=0):
    # Resolve content-addressed storage inside the sandbox; generated code never
    # needs to guess a host path or Docker mount path.
    if isinstance(index, bool) or not isinstance(index, int):
        raise TypeError("dataset index must be an integer")
    try:
        _reprolab_path = _reprolab_dataset_paths[index]
    except IndexError as _reprolab_error:
        raise IndexError(
            f"dataset index {{index}} is unavailable; selected dataset count: {{len(_reprolab_dataset_paths)}}"
        ) from _reprolab_error
    import pandas as _reprolab_pd
    with open(_reprolab_path, "rb") as _reprolab_stream:
        _reprolab_signature = _reprolab_stream.read(4)
    if _reprolab_signature.startswith(b"PK"):
        return _reprolab_pd.read_excel(_reprolab_path)
    return _reprolab_pd.read_csv(_reprolab_path)
def _reprolab_artifact_value(kind, value):
    if kind == "table":
        import json as _reprolab_json
        import pandas as _reprolab_pd
        if isinstance(value, _reprolab_pd.Series):
            value = value.to_frame()
        if isinstance(value, _reprolab_pd.DataFrame):
            return _reprolab_json.loads(value.to_json(orient="split", force_ascii=False))
    return value
class _ReproLabArtifact:
    def __init__(self, kind, value, title=None, tol=None):
        self.payload = {{
            "kind": kind,
            "value": _reprolab_artifact_value(kind, value),
            "title": title,
            "tol": tol,
        }}
    def _repr_mimebundle_(self, include=None, exclude=None):
        return {{
            "application/vnd.reprolab.artifact+json": self.payload,
            "text/plain": repr(self.payload.get("value")),
        }}
def emit_artifact(kind, value, title=None, tol=None):
    # Register a structured value with the provenance ledger.
    if kind not in {{"number", "coefficient", "table", "figure", "text", "conclusion"}}:
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
"""
