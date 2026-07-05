from app.services.agents.nli import NLIResult, _json_object, passes_threshold


def test_nli_structured_result_and_threshold():
    payload = _json_object('```json\n{"label":"entailment","support_score":0.55}\n```')
    assert payload["label"] == "entailment"
    result = NLIResult("entailment", 0.55, "chunk:1", "部分支持")
    assert not passes_threshold(result, threshold=0.6)
    assert passes_threshold(result, threshold=0.5)
    assert not passes_threshold(NLIResult("neutral", 0.99, "chunk:1", "无关"), threshold=0.5)
