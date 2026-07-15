from copy import deepcopy
from types import SimpleNamespace

import pytest

from app.models.knowledge import Dataset
from app.models.skills import Skill
from app.services.agents.model_adapter import ModelResponse
from app.services.skills.apply import map_roles, render_template
from app.services.skills.exchange import export_skill, validate_package
from app.services.skills.hub import list_hub


class FakeAdapter:
    def __init__(self, content: str, tokens: int = 0):
        self.content = content
        self.tokens = tokens
        self.requests = []

    def chat(self, request):
        self.requests.append(request)
        return ModelResponse(content=self.content, usage={"total_tokens": self.tokens})


def test_role_mapping_uses_adapter_and_renders_safe_column_literals():
    skill = Skill(
        name="分组比较",
        discipline="general",
        template="group_col = {{group}}\nvalue_col = {{value}}",
        intent="分组分布对比+检验",
        input_roles={
            "group": {"description": "分组列", "required": True},
            "value": {"description": "数值列", "required": True},
        },
    )
    dataset = Dataset(
        name="new.csv",
        storage_hash="a" * 64,
        schema_json={"columns": [
            {"name": "species", "dtype": "object"},
            {"name": "body_mass_g", "dtype": "float64"},
        ]},
    )
    adapter = FakeAdapter(
        '{"mapping":{"group":"species","value":"body_mass_g"},'
        '"confidence":0.98,"reason":"语义匹配"}',
        tokens=73,
    )
    mapping, reason, tokens = map_roles(skill, [dataset], adapter)
    code = render_template(skill.template, skill.input_roles, mapping)
    assert mapping == {"group": "species", "value": "body_mass_g"}
    assert reason == "语义匹配"
    assert tokens == 73 and len(adapter.requests) == 1
    assert "'species'" in code and "'body_mass_g'" in code


def test_unreliable_or_nonexistent_mapping_is_rejected():
    skill = Skill(
        name="x", template="x={{value}}", intent="x",
        input_roles={"value": {"description": "数值", "required": True}},
    )
    dataset = Dataset(name="x", storage_hash="b" * 64, schema_json={"columns": [{"name": "actual"}]})
    adapter = FakeAdapter('{"mapping":{"value":"invented"},"confidence":0.99,"reason":"猜测"}', tokens=41)
    with pytest.raises(ValueError, match="猜测") as exc:
        map_roles(skill, [dataset], adapter)
    assert getattr(exc.value, "tokens", 0) == 41


def test_skill_exchange_round_trip_and_tamper_detection():
    skill = SimpleNamespace(
        name="箱线图", discipline="general", intent="分组比较",
        template="group={{group}}", input_roles={"group": {"required": True}},
        version=2, meta={"source_run_id": "run", "candidate_memory_ids": ["private"]},
    )
    package = export_skill(skill)
    assert validate_package(package)["template"] == "group={{group}}"
    assert "candidate_memory_ids" not in package["skill"]["meta"]
    tampered = deepcopy(package)
    tampered["skill"]["intent"] = "被篡改"
    with pytest.raises(ValueError, match="hash mismatch"):
        validate_package(tampered)


def test_skill_hub_exposes_versioned_catalog_item():
    items = list_hub()
    assert len(items) >= 3 and all(item.version >= 1 for item in items)
    assert all(item.intent and item.author and item.package_hash for item in items)
    assert all(item.tools and item.outputs and item.workflow for item in items)
