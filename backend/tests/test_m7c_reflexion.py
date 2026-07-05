from app.schemas.verify import VerifyItem
from app.services.agents.reflexion import build_reflection


def test_reflection_is_structured_from_fail_items():
    item = VerifyItem(
        check="number", target_anchor="⟦art_abcd⟧", verdict="fail", severity="error",
        reason="正文数字与产物值不符", locate="chars 0:10",
    )
    reflection = build_reflection([item])
    assert "number:⟦art_abcd⟧" in reflection
    assert "不符" in reflection
