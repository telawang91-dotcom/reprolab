import uuid

import pytest
from pydantic import ValidationError

from app.schemas.skills import SkillCreate
from app.services.skills.builtin import BUILTIN_PACKS
from app.services.skills.registry import SkillPack, SkillRegistry


def test_registry_filters_without_limiting_dynamic_analysis():
    registry = SkillRegistry()
    general = SkillPack(uuid.uuid4(), "general", "general", ("pandas",), "prompt", "table", "print(1)")
    biology = SkillPack(uuid.uuid4(), "biology", "biology", ("pandas",), "prompt", "plot", "print(2)")
    registry.register(general); registry.register(biology)
    assert registry.get(general.id) == general
    assert registry.list("biology") == [biology]
    assert len(registry.list()) == 2


def test_builtins_and_skill_contract_are_nonempty():
    assert any(pack.discipline == "general" for pack in BUILTIN_PACKS)
    assert any(pack.discipline == "materials" for pack in BUILTIN_PACKS)
    assert all(pack.code_template and "emit_artifact" in pack.code_template for pack in BUILTIN_PACKS)
    request = SkillCreate(name="自定义", discipline="biology", template="print('ok')")
    assert request.meta is None
    with pytest.raises(ValidationError):
        SkillCreate(name="空模板", discipline="biology", template="")
