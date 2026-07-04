from functools import lru_cache

from app.core.config import settings


@lru_cache(maxsize=1)
def get_model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(settings.embedding_model)


def encode(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    vectors = get_model().encode(texts, normalize_embeddings=True, show_progress_bar=False)
    result = vectors.tolist()
    if any(len(vector) != 1024 for vector in result):
        raise RuntimeError("embedding model must produce 1024-dimensional vectors")
    return result


def preheat() -> None:
    encode(["ReproLab embedding warm-up"])

