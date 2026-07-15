from typing import Any

from sqlalchemy.orm import Session

from app.schemas.skills import SkillHubItem
from app.services.skills.exchange import FORMAT, PACKAGE_VERSION, import_skill, package_hash


def _package(
    *,
    name: str,
    intent: str,
    template: str,
    input_roles: dict[str, dict[str, Any]],
    tools: list[str],
    outputs: list[str],
    workflow: list[str],
    estimated_tokens: int,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "format": FORMAT,
        "package_version": PACKAGE_VERSION,
        "skill": {
            "name": name,
            "discipline": "general",
            "intent": intent,
            "version": 1,
            "input_roles": input_roles,
            "template": template,
            "meta": {
                "author": "ReproLab Community",
                "estimated_from_scratch_tokens": estimated_tokens,
                "seed": 42,
                "tools": tools,
                "outputs": outputs,
                "workflow": workflow,
            },
        },
    }
    payload["package_hash"] = package_hash(payload)
    return payload


def _community_boxplot() -> dict[str, Any]:
    return _package(
        name="分组分布对比与显著性检验",
        intent="比较多个分组的数值分布，绘制箱线图并完成显著性检验",
        input_roles={
            "group": {"description": "分组或类别列", "dtype": "categorical", "required": True},
            "value": {"description": "待比较的连续数值列", "dtype": "numeric", "required": True},
        },
        tools=["pandas", "scipy", "matplotlib", "emit_artifact"],
        outputs=["描述统计表", "检验统计量", "p 值", "箱线图"],
        workflow=["映射分组与数值字段", "按组清理缺失值", "执行显著性检验", "登记统计量与图形血缘"],
        estimated_tokens=1800,
        template="""import pandas as pd
import matplotlib.pyplot as plt
from scipy import stats
path = DATASET_PATHS[0]
df = pd.read_excel(path) if str(path).lower().endswith('.xlsx') else pd.read_csv(path, sep='\t' if str(path).lower().endswith('.tsv') else ',')
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
    )


def _community_relationship() -> dict[str, Any]:
    return _package(
        name="双变量关系与稳健回归",
        intent="检查两个连续变量的相关关系、异常值影响与线性趋势",
        input_roles={
            "x": {"description": "解释变量或横轴数值列", "dtype": "numeric", "required": True},
            "y": {"description": "响应变量或纵轴数值列", "dtype": "numeric", "required": True},
        },
        tools=["pandas", "scipy", "matplotlib", "emit_artifact"],
        outputs=["有效样本数", "Pearson 相关系数", "p 值", "散点趋势图"],
        workflow=["映射两个数值字段", "成对剔除缺失值", "计算相关与显著性", "绘制趋势并登记可信产物"],
        estimated_tokens=1500,
        template="""import pandas as pd
import matplotlib.pyplot as plt
from scipy import stats
path = DATASET_PATHS[0]
df = pd.read_excel(path) if str(path).lower().endswith('.xlsx') else pd.read_csv(path, sep='\t' if str(path).lower().endswith('.tsv') else ',')
x_col = {{x}}
y_col = {{y}}
paired = df[[x_col, y_col]].dropna()
if len(paired) < 3:
    raise ValueError('有效配对样本少于 3 个，无法执行相关分析')
r_value, p_value = stats.pearsonr(paired[x_col], paired[y_col])
emit_artifact('number', int(len(paired)), title='有效配对样本数', tol=0)
emit_artifact('coefficient', float(r_value), title='Pearson 相关系数', tol=1e-6)
emit_artifact('number', float(p_value), title='相关性检验 p 值', tol=1e-6)
plt.scatter(paired[x_col], paired[y_col], alpha=.7)
plt.xlabel(x_col)
plt.ylabel(y_col)
plt.title(f'{y_col} vs {x_col}')
plt.show()
""",
    )


def _community_quality_audit() -> dict[str, Any]:
    return _package(
        name="数据质量体检",
        intent="在分析前检查数据规模、缺失值、重复记录和数值列异常范围",
        input_roles={},
        tools=["pandas", "emit_artifact"],
        outputs=["质量概览表", "总行数", "重复行数", "缺失单元格数"],
        workflow=["读取原始数据", "核对行列与字段类型", "统计缺失和重复", "输出可追溯质量报告"],
        estimated_tokens=1200,
        template="""import pandas as pd
path = DATASET_PATHS[0]
df = pd.read_excel(path) if str(path).lower().endswith('.xlsx') else pd.read_csv(path, sep='\t' if str(path).lower().endswith('.tsv') else ',')
missing = df.isna().sum().sort_values(ascending=False)
report = pd.DataFrame({
    'column': [str(column) for column in df.columns],
    'dtype': [str(dtype) for dtype in df.dtypes],
    'missing': [int(missing[column]) for column in df.columns],
    'unique': [int(df[column].nunique(dropna=True)) for column in df.columns],
})
emit_artifact('number', int(len(df)), title='数据总行数', tol=0)
emit_artifact('number', int(df.duplicated().sum()), title='完全重复行数', tol=0)
emit_artifact('number', int(df.isna().sum().sum()), title='缺失单元格数', tol=0)
emit_artifact('table', report.to_dict(orient='records'), title='数据质量概览')
""",
    )


_PACKAGES = {
    "community-data-quality": _community_quality_audit(),
    "community-group-boxplot": _community_boxplot(),
    "community-relationship": _community_relationship(),
}


def list_hub() -> list[SkillHubItem]:
    items = []
    for item_id, package in _PACKAGES.items():
        skill = package["skill"]
        meta = skill.get("meta") or {}
        roles = [
            {"name": name, **spec}
            for name, spec in (skill.get("input_roles") or {}).items()
        ]
        items.append(SkillHubItem(
            id=item_id,
            name=skill["name"],
            intent=skill["intent"],
            discipline=skill["discipline"],
            version=skill["version"],
            author=meta["author"],
            input_roles=roles,
            tools=list(meta.get("tools") or []),
            outputs=list(meta.get("outputs") or []),
            workflow=list(meta.get("workflow") or []),
            estimated_from_scratch_tokens=int(meta.get("estimated_from_scratch_tokens") or 0),
            package_hash=package["package_hash"],
        ))
    return items


def import_from_hub(db: Session, project_id, hub_id: str):
    package = _PACKAGES.get(hub_id)
    if package is None:
        raise LookupError("SkillHub skill not found")
    return import_skill(db, project_id, package, origin="hub")
