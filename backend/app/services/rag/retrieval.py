import math
import logging
import re
import uuid
from collections import defaultdict
from dataclasses import dataclass
from functools import lru_cache
from typing import Iterable, Sequence

from rank_bm25 import BM25Okapi
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.knowledge import Chunk, Document
from app.schemas.search import SearchFilters, SearchHit
from app.services.rag.embedder import encode_one

RECALL_LIMIT = 50
RERANK_LIMIT = settings.rerank_limit
RRF_K = 60
logger = logging.getLogger(__name__)


@dataclass(slots=True)
class Candidate:
    chunk: Chunk
    document: Document
    score: float = 0.0

    @property
    def id(self) -> uuid.UUID:
        return self.chunk.id


def _scope_statement(
    project_id: uuid.UUID,
    filters: SearchFilters | None,
    collection_id: uuid.UUID | None = None,
) -> Select:
    statement = (
        select(Chunk, Document)
        .join(Document, Chunk.document_id == Document.id)
        .where(Document.project_id == project_id)
    )
    if filters and filters.year_gte is not None:
        statement = statement.where(Document.year >= filters.year_gte)
    if filters and filters.type is not None:
        statement = statement.where(Document.type == filters.type)
    if collection_id is not None:
        statement = statement.where(Document.collection_id == collection_id)
    return statement


def metadata_prefilter(
    db: Session,
    project_id: uuid.UUID,
    filters: SearchFilters | None,
    collection_id: uuid.UUID | None = None,
) -> list[Candidate]:
    return [Candidate(chunk=row.Chunk, document=row.Document) for row in db.execute(
        _scope_statement(project_id, filters, collection_id)
    )]


def _tokens(text: str) -> list[str]:
    lowered = text.lower()
    words = re.findall(r"[a-z0-9_]+", lowered)
    cjk_runs = re.findall(r"[\u3400-\u9fff]+", lowered)
    cjk_tokens: list[str] = []
    for run in cjk_runs:
        cjk_tokens.extend(run)
        cjk_tokens.extend(run[index : index + 2] for index in range(len(run) - 1))
    return words + cjk_tokens or [lowered]


def bm25_search(query: str, candidates: Sequence[Candidate], limit: int = RECALL_LIMIT) -> list[Candidate]:
    if not candidates:
        return []
    index = BM25Okapi([_tokens(item.chunk.content) for item in candidates])
    scores = index.get_scores(_tokens(query))
    ranked = sorted(zip(candidates, scores, strict=True), key=lambda item: (-float(item[1]), str(item[0].id)))
    return [Candidate(item.chunk, item.document, float(score)) for item, score in ranked[:limit]]


def pgvector_search(
    db: Session,
    project_id: uuid.UUID,
    query: str,
    filters: SearchFilters | None,
    limit: int = RECALL_LIMIT,
    collection_id: uuid.UUID | None = None,
) -> list[Candidate]:
    query_vector = list(encode_one(query))
    distance = Chunk.embedding.cosine_distance(query_vector)
    rows = db.execute(
        _scope_statement(project_id, filters, collection_id)
        .where(Chunk.embedding.is_not(None))
        .add_columns(distance.label("distance"))
        .order_by(distance)
        .limit(limit)
    )
    return [Candidate(row.Chunk, row.Document, 1.0 - float(row.distance)) for row in rows]


def rrf(rank_lists: Iterable[Sequence[Candidate]], k_const: int = RRF_K) -> list[tuple[uuid.UUID, float]]:
    fused: defaultdict[uuid.UUID, float] = defaultdict(float)
    for ranked in rank_lists:
        for rank, candidate in enumerate(ranked):
            fused[candidate.id] += 1.0 / (k_const + rank + 1)
    return sorted(fused.items(), key=lambda item: (-item[1], str(item[0])))


@lru_cache(maxsize=1)
def get_reranker():
    from sentence_transformers import CrossEncoder

    return CrossEncoder(settings.reranker_model, max_length=512)


def rerank(query: str, candidates: Sequence[Candidate], limit: int) -> list[Candidate]:
    if not candidates:
        return []
    texts = tuple(item.chunk.content for item in candidates)
    raw_scores = _predict_scores(query, texts)
    scored = [Candidate(item.chunk, item.document, float(score)) for item, score in zip(candidates, raw_scores, strict=True)]
    return sorted(scored, key=lambda item: (-item.score, str(item.id)))[:limit]


@lru_cache(maxsize=256)
def _predict_scores(query: str, texts: tuple[str, ...]) -> tuple[float, ...]:
    scores = get_reranker().predict(
        [(query, text) for text in texts], show_progress_bar=False
    )
    return tuple(float(score) for score in scores)


def _to_hits(candidates: Sequence[Candidate]) -> list[SearchHit]:
    return [
        SearchHit(
            chunk_id=item.chunk.id,
            document_id=item.document.id,
            content=item.chunk.content,
            section=item.chunk.section,
            position=item.chunk.position,
            score=item.score if math.isfinite(item.score) else 0.0,
        )
        for item in candidates
    ]


def complex_retrieve(
    db: Session,
    project_id: uuid.UUID,
    query: str,
    mode: str = "hybrid",
    filters: SearchFilters | None = None,
    k: int = 8,
    collection_id: uuid.UUID | None = None,
) -> list[SearchHit]:
    scope = metadata_prefilter(db, project_id, filters, collection_id)
    if mode == "keyword":
        return _to_hits(bm25_search(query, scope, k))
    try:
        semantic = pgvector_search(
            db, project_id, query, filters, RECALL_LIMIT, collection_id
        )
    except Exception:
        if mode == "semantic":
            raise
        logger.exception("semantic recall unavailable; continuing with keyword recall")
        semantic = []
    if mode == "semantic":
        return _to_hits(semantic[:k])
    keyword = bm25_search(query, scope, RECALL_LIMIT)
    by_id = {item.id: item for item in [*semantic, *keyword]}
    fused = rrf([semantic, keyword])[:RERANK_LIMIT]
    fused_candidates = [
        Candidate(by_id[item_id].chunk, by_id[item_id].document, score)
        for item_id, score in fused
    ]
    try:
        return _to_hits(rerank(query, fused_candidates, k))
    except Exception:
        logger.exception("cross-encoder reranker unavailable; returning fused recall order")
        return _to_hits(fused_candidates[:k])
