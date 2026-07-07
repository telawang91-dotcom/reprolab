from typing import Any

from sqlalchemy.orm import Session

from app.schemas.skills import SkillHubItem
from app.services.skills.exchange import FORMAT, PACKAGE_VERSION, import_skill, package_hash


def _community_boxplot() -> dict[str, Any]:
    payload: dict[str, Any] = {
        "format": FORMAT,
        "package_version": PACKAGE_VERSION,
        "skill": {
            "name": "分组分布对比与显著性检验",
            "discipline": "general",
            "intent": "比较多个分组的数值分布，绘制箱线图并完成显著性检验",
            "version": 1,
            "input_roles": {
                "group": {"description": "分组或类别列", "dtype": "categorical", "required": True},
                "value": {"description": "待比较的连续数值列", "dtype": "numeric", "required": True},
            },
            "template": """import pandas as pd
import matplotlib.pyplot as plt
from scipy import stats
df = pd.read_csv(DATASET_PATHS[0])
group_col = {{group}}
value_col = {{value}}
groups = [part[value_col].dropna().to_numpy() for _, part in df.groupby(group_col)]
groups = [item for item in groups if len(item)]
statistic, p_value = stats.f_oneway(*groups)
emit_artifact('coefficient', float(statistic), title='组间检验统计量', tol=1e-6)
emit_artifact('number', float(p_value), title='组间检验 p 值', tol=1e-6)
df.boxplot(column=value_col, by=group_col)
plt.suptitle('')
plt.title(f'{value_col} by {group_col}')
plt.show()
""",
            "meta": {"author": "ReproLab Community", "estimated_from_scratch_tokens": 1800, "seed": 42},
        },
    }
    payload["package_hash"] = package_hash(payload)
    return payload


_PACKAGES = {"community-group-boxplot": _community_boxplot()}


def list_hub() -> list[SkillHubItem]:
    items = []
    for item_id, package in _PACKAGES.items():
        skill = package["skill"]
        items.append(SkillHubItem(
            id=item_id,
            name=skill["name"],
            intent=skill["intent"],
            discipline=skill["discipline"],
            version=skill["version"],
            author=skill["meta"]["author"],
        ))
    return items


def import_from_hub(db: Session, project_id, hub_id: str):
    package = _PACKAGES.get(hub_id)
    if package is None:
        raise LookupError("SkillHub skill not found")
    return import_skill(db, project_id, package, origin="hub")
