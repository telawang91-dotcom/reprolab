from app.services.agents.anchors import extract_anchors, extract_numbers


def test_extracts_bound_and_bare_numbers_without_anchor_hex_noise():
    text = "系数 0.083⟦art_0a1f⟧，但报告又写了 9.9，并引用⟦src_9c2e⟧。"
    anchors = extract_anchors(text)
    numbers = extract_numbers(text)
    assert [(item.kind, item.code) for item in anchors] == [("art", "0a1f"), ("src", "9c2e")]
    assert len(numbers) == 2
    assert numbers[0].value == 0.083 and numbers[0].anchor.raw == "⟦art_0a1f⟧"
    assert numbers[1].value == 9.9 and numbers[1].anchor is None


def test_scientific_notation_and_leading_decimal_are_supported():
    numbers = extract_numbers("p=.01⟦art_abcd⟧，误差为 -1.2e-3⟦art_1234⟧")
    assert [item.value for item in numbers] == [0.01, -0.0012]
    assert all(item.anchor is not None for item in numbers)

