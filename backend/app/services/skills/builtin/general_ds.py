import uuid

from app.services.skills.registry import SkillPack

GENERAL_CODE = """import pandas as pd
import matplotlib.pyplot as plt
from scipy import stats

df = load_dataset(0)
numeric = list(df.select_dtypes(include='number').columns)
if not numeric:
    raise ValueError('数据集中没有数值列')
value_col = numeric[0]
group_candidates = [c for c in df.columns if c != value_col and 2 <= df[c].nunique(dropna=True) <= 12]
group_col = group_candidates[0] if group_candidates else None
summary = df[numeric].describe().reset_index()
emit_artifact('table', summary.to_dict(orient='records'), title='描述统计')
if group_col:
    groups = [part[value_col].dropna().to_numpy() for _, part in df.groupby(group_col)]
    groups = [group for group in groups if len(group)]
    if len(groups) == 2:
        statistic, p_value = stats.ttest_ind(groups[0], groups[1], equal_var=False)
    elif len(groups) > 2:
        statistic, p_value = stats.f_oneway(*groups)
    else:
        statistic, p_value = float('nan'), float('nan')
    emit_artifact('coefficient', float(statistic), title='组间检验统计量', tol=1e-6)
    emit_artifact('number', float(p_value), title='组间检验 p 值', tol=1e-6)
    df.boxplot(column=value_col, by=group_col)
    plt.suptitle('')
    plt.title(f'{value_col} by {group_col}')
    plt.show()
else:
    emit_artifact('number', float(df[value_col].mean()), title=f'{value_col} 均值', tol=1e-6)
"""

GENERAL_DATA_SCIENCE = SkillPack(
    id=uuid.UUID("10000000-0000-5000-8000-000000000001"),
    name="数据概览与初步探索",
    discipline="general",
    tools=("pandas", "scipy", "matplotlib", "emit_artifact"),
    prompt_template=(
        "根据用户问题和真实数据结构动态检查规模、类型、缺失、分布与候选关系；"
        "模板只提供初始探索路径，Agent 可按任务改写代码、统计方法和输出形式。"
    ),
    renderer="table+boxplot",
    code_template=GENERAL_CODE,
)
