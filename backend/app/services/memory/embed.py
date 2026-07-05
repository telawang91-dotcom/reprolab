from app.services.rag.embedder import encode


def embed_memory(content: str) -> list[float]:
    return encode([content])[0]
