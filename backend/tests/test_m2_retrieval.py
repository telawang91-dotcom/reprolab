import uuid

import pytest
from pydantic import ValidationError

from app.models.knowledge import Chunk, Document
from app.schemas.search import Citation, SearchRequest
from app.services.rag.qa import extract_citations, source_anchor
from app.services.rag.retrieval import Candidate, bm25_search, rrf


def candidate(identifier: int, content: str = "evidence") -> Candidate:
    chunk = Chunk(id=uuid.UUID(int=identifier), content=content)
    document = Document(
        id=uuid.UUID(int=identifier + 100),
        type="paper",
        filename=f"{identifier}.pdf",
        storage_hash="0" * 64,
    )
    return Candidate(chunk=chunk, document=document)


def test_rrf_matches_hand_calculation():
    first = [candidate(1), candidate(2)]
    second = [candidate(2), candidate(3)]
    scores = dict(rrf([first, second]))
    assert scores[first[0].id] == pytest.approx(1 / 61)
    assert scores[first[1].id] == pytest.approx(1 / 62 + 1 / 61)
    assert scores[second[1].id] == pytest.approx(1 / 62)
    assert max(scores, key=scores.get) == first[1].id


def test_bm25_handles_chinese_terms():
    penguin = candidate(1, "企鹅体重与性别存在差异")
    unrelated = candidate(2, "气候变化与海洋温度")
    assert bm25_search("企鹅体重", [unrelated, penguin], 1)[0].id == penguin.id


def test_citation_mapping_only_accepts_known_anchors():
    document_id = uuid.UUID("abcd0000-0000-0000-0000-000000000000")
    chunk_id = uuid.uuid4()
    anchor = source_anchor(document_id)
    citation = Citation(document_id=document_id, chunk_id=chunk_id, anchor=anchor)
    answer = f"结论有证据{anchor}，未知来源⟦src_dead⟧。"
    assert extract_citations(answer, {anchor: citation}) == [citation]


def test_search_contract_forbids_unknown_fields():
    with pytest.raises(ValidationError):
        SearchRequest(project_id=uuid.uuid4(), query="x", unexpected=True)

