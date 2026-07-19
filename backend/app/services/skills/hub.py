from typing import Any

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.knowledge import Dataset
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
    discipline: str = "general",
    recommend_when: list[str] | None = None,
    recommendation: str | None = None,
    min_matches: int = 1,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "format": FORMAT,
        "package_version": PACKAGE_VERSION,
        "skill": {
            "name": name,
            "discipline": discipline,
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
                "recommend_when": recommend_when or [],
                "recommendation": recommendation,
                "min_matches": min_matches,
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
df = load_dataset(0)
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
df = load_dataset(0)
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
df = load_dataset(0)
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


def _air_quality_station_trend() -> dict[str, Any]:
    return _package(
        name="多站点污染物季度趋势",
        intent="比较多个监测站的污染物数据质量、中心水平与季度变化趋势",
        discipline="environment",
        input_roles={
            "station": {"description": "监测站点列", "dtype": "categorical", "required": True},
            "pollutant": {"description": "污染物浓度列，例如 PM2.5", "dtype": "numeric", "required": True, "preferred_columns": ["PM2.5", "PM10", "NO2"]},
            "year": {"description": "观测年份列", "dtype": "numeric", "required": True},
            "month": {"description": "观测月份列", "dtype": "numeric", "required": True},
        },
        tools=["pandas", "matplotlib", "emit_artifact"],
        outputs=["站点质量与描述统计表", "季度变化趋势图"],
        workflow=["映射站点、污染物与时间字段", "核对有效值和缺失值", "汇总站点均值与中位数", "绘制季度趋势并登记血缘"],
        estimated_tokens=2200,
        recommend_when=["station", "PM2.5", "year", "month"],
        min_matches=3,
        recommendation="检测到站点、污染物和年月字段，适合直接比较多站点季度趋势。",
        template="""import pandas as pd
import matplotlib.pyplot as plt
df = load_dataset(0)
station_col = {{station}}
pollutant_col = {{pollutant}}
year_col = {{year}}
month_col = {{month}}
summary = df.groupby(station_col, dropna=False)[pollutant_col].agg(
    total_records='size', valid_records='count', mean='mean', median='median'
).reset_index()
summary['missing_records'] = summary['total_records'] - summary['valid_records']
summary['missing_rate_pct'] = (summary['missing_records'] / summary['total_records'] * 100).round(2)
summary[['mean', 'median']] = summary[['mean', 'median']].round(2)
emit_artifact('table', summary, title='各站点污染物质量与描述统计汇总表')
clean = df[[station_col, pollutant_col, year_col, month_col]].dropna().copy()
clean['quarter'] = clean[year_col].astype(int).astype(str) + 'Q' + (((clean[month_col].astype(int) - 1) // 3) + 1).astype(str)
quarterly = clean.groupby(['quarter', station_col])[pollutant_col].mean().unstack(station_col).sort_index()
ax = quarterly.plot(figsize=(11, 5.8), marker='o', markersize=4, linewidth=2)
ax.set_title(f'{pollutant_col} 季度均值变化', loc='left', pad=16, fontweight='semibold')
ax.set_xlabel('季度')
ax.set_ylabel(f'{pollutant_col} 浓度')
ax.legend(title='站点', frameon=False, ncol=min(3, len(quarterly.columns)))
plt.xticks(rotation=45, ha='right')
plt.tight_layout()
plt.show()
""",
    )


def _air_quality_weather_relation() -> dict[str, Any]:
    return _package(
        name="污染物与气象变量关联",
        intent="评估污染物与温度、风速等气象变量的稳健相关关系并可视化",
        discipline="environment",
        input_roles={
            "pollutant": {"description": "污染物浓度列，例如 PM2.5", "dtype": "numeric", "required": True, "preferred_columns": ["PM2.5", "PM10", "NO2"]},
            "weather": {"description": "气象数值列，例如温度或风速", "dtype": "numeric", "required": True, "preferred_columns": ["WSPM", "TEMP", "DEWP", "PRES"]},
        },
        tools=["pandas", "numpy", "scipy", "matplotlib", "emit_artifact"],
        outputs=["Spearman 关联汇总表", "抽样散点与趋势图"],
        workflow=["映射污染物与气象字段", "成对剔除缺失值", "计算稳健相关与显著性", "绘制抽样散点趋势并说明非因果边界"],
        estimated_tokens=1900,
        recommend_when=["PM2.5", "TEMP", "WSPM", "DEWP", "PRES"],
        min_matches=2,
        recommendation="检测到污染物与多项气象字段，适合探索相关模式并明确非因果边界。",
        template="""import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from scipy import stats
df = load_dataset(0)
pollutant_col = {{pollutant}}
weather_col = {{weather}}
paired = df[[weather_col, pollutant_col]].dropna()
if len(paired) < 3:
    raise ValueError('有效配对样本少于 3 个，无法执行关联分析')
rho, p_value = stats.spearmanr(paired[weather_col], paired[pollutant_col])
report = pd.DataFrame([{'气象变量': weather_col, '污染物': pollutant_col, '有效样本数': int(len(paired)), 'Spearman相关系数': round(float(rho), 4), 'p值': float(p_value), '解释边界': '相关不等于因果'}])
emit_artifact('table', report, title='污染物与气象变量稳健关联汇总表')
sample = paired.sample(min(5000, len(paired)), random_state=SEED).sort_values(weather_col)
fig, ax = plt.subplots(figsize=(9.5, 5.8))
ax.scatter(sample[weather_col], sample[pollutant_col], s=12, alpha=.18, edgecolors='none')
if sample[weather_col].nunique() > 1:
    coefficients = np.polyfit(sample[weather_col], sample[pollutant_col], 1)
    ax.plot(sample[weather_col], np.polyval(coefficients, sample[weather_col]), linewidth=2.4, label='线性趋势')
    ax.legend(frameon=False)
ax.set_title(f'{pollutant_col} 与 {weather_col} 的关联', loc='left', pad=16, fontweight='semibold')
ax.set_xlabel(weather_col)
ax.set_ylabel(pollutant_col)
plt.tight_layout()
plt.show()
""",
    )


_PACKAGES = {
    "environment-station-quarterly-trend": _air_quality_station_trend(),
    "environment-weather-relation": _air_quality_weather_relation(),
    "community-data-quality": _community_quality_audit(),
    "community-group-boxplot": _community_boxplot(),
    "community-relationship": _community_relationship(),
}


def _project_columns(db: Session | None, project_id: uuid.UUID | None) -> set[str]:
    if db is None or project_id is None:
        return set()
    columns: set[str] = set()
    for schema in db.scalars(select(Dataset.schema_json).where(Dataset.project_id == project_id)):
        for item in (schema or {}).get("columns", []):
            name = item.get("name") if isinstance(item, dict) else item
            if isinstance(name, str):
                columns.add(name.lower())
    return columns


def list_hub(db: Session | None = None, project_id: uuid.UUID | None = None) -> list[SkillHubItem]:
    project_columns = _project_columns(db, project_id)
    items = []
    for item_id, package in _PACKAGES.items():
        skill = package["skill"]
        meta = skill.get("meta") or {}
        roles = [
            {"name": name, **spec}
            for name, spec in (skill.get("input_roles") or {}).items()
        ]
        expected = [str(item).lower() for item in meta.get("recommend_when") or []]
        matches = [item for item in expected if item in project_columns]
        recommended = bool(project_columns) and (
            (expected and len(matches) >= int(meta.get("min_matches") or 1))
            or (not expected and item_id == "community-data-quality")
        )
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
            recommended=recommended,
            recommendation_reason=(meta.get("recommendation") if recommended else None) or ("适合在当前数据上先完成结构与缺失检查。" if recommended else None),
        ))
    return sorted(items, key=lambda item: (not item.recommended, item.name))


def import_from_hub(db: Session, project_id, hub_id: str):
    package = _PACKAGES.get(hub_id)
    if package is None:
        raise LookupError("SkillHub skill not found")
    return import_skill(db, project_id, package, origin="hub")
