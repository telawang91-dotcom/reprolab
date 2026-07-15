import threading
from functools import lru_cache

from app.core.config import settings


_model = None
_model_lock = threading.Lock()


def get_model():
    global _model
    if _model is not None:
        return _model
    with _model_lock:
        if _model is None:
            from sentence_transformers import SentenceTransformer

            _model = SentenceTransformer(settings.embedding_model)
    return _model


def encode(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    vectors = get_model().encode(texts, normalize_embeddings=True, show_progress_bar=False)
    result = vectors.tolist()
    if any(len(vector) != 1024 for vector in result):
        raise RuntimeError("embedding model must produce 1024-dimensional vectors")
    return result


@lru_cache(maxsize=512)
def encode_one(text: str) -> tuple[float, ...]:
    """Cache repeated query/memory embeddings without changing document batch ingestion."""
    return tuple(encode([text])[0])


def preheat() -> None:
    encode(["ReproLab embedding warm-up"])


def start_preheat() -> None:
    def warm() -> None:
        try:
            preheat()
        except Exception:
            # A later semantic request can retry and surface a recoverable error.
            return

    threading.Thread(target=warm, name="reprolab-embedding-preheat", daemon=True).start()
