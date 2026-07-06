import json


def seed_prefix(seed: int | None, dataset_paths: list[str] | None = None) -> str:
    resolved = 42 if seed is None else seed
    paths = json.dumps(dataset_paths or [], ensure_ascii=False)
    return f"""SEED = {resolved!r}
DATASET_PATHS = {paths}
import os as _reprolab_os, random as _reprolab_random
from IPython.display import display as _reprolab_display
class _ReproLabArtifact:
    def __init__(self, kind, value, title=None, tol=None):
        self.payload = {{"kind": kind, "value": value, "title": title, "tol": tol}}
    def _repr_mimebundle_(self, include=None, exclude=None):
        return {{
            "application/vnd.reprolab.artifact+json": self.payload,
            "text/plain": repr(self.payload.get("value")),
        }}
def emit_artifact(kind, value, title=None, tol=None):
    # Register a structured value with the provenance ledger.
    if kind not in {{"number", "coefficient", "table", "figure", "conclusion"}}:
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
