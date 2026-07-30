from app.services.agents.nli import (
    NLIResult,
    _json_object,
    calibrate_support_threshold,
    passes_threshold,
)


def test_nli_structured_result_and_threshold():
    payload = _json_object('```json\n{"label":"entailment","support_score":0.55}\n```')
    assert payload["label"] == "entailment"
    result = NLIResult("entailment", 0.55, "chunk:1", "部分支持")
    assert not passes_threshold(result, threshold=0.6)
    assert passes_threshold(result, threshold=0.5)
    assert not passes_threshold(NLIResult("neutral", 0.99, "chunk:1", "无关"), threshold=0.5)


def test_nli_threshold_calibration_prefers_precision_for_a_trust_gate():
    samples = [
        (True, NLIResult("entailment", 0.91, "chunk:1", "直接支持")),
        (True, NLIResult("entailment", 0.78, "chunk:2", "支持")),
        (False, NLIResult("entailment", 0.62, "chunk:3", "误判支持")),
        (False, NLIResult("neutral", 0.20, "chunk:4", "无关")),
    ]

    calibrated = calibrate_support_threshold(samples)

    assert calibrated["threshold"] > 0.62
    assert calibrated["precision"] == 1.0
    assert calibrated["recall"] == 1.0
