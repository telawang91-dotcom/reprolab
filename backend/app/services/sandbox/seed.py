def seed_prefix(seed: int | None) -> str:
    resolved = 42 if seed is None else seed
    return f"""SEED = {resolved!r}
import os as _reprolab_os, random as _reprolab_random
_reprolab_os.environ["PYTHONHASHSEED"] = str(SEED)
_reprolab_random.seed(SEED)
try:
    import numpy as _reprolab_np
    _reprolab_np.random.seed(SEED)
except ImportError:
    pass
try:
    import torch as _reprolab_torch
    _reprolab_torch.manual_seed(SEED)
except ImportError:
    pass
"""

