import uuid

from app.services.skills.builtin.general_ds import GENERAL_CODE
from app.services.skills.registry import SkillPack


COMPARATIVE_EXPLORATION = SkillPack(
    id=uuid.UUID("10000000-0000-5000-8000-000000000002"),
    name="变量关系与组间比较",
    discipline="general",
    tools=("pandas", "scipy", "matplotlib", "emit_artifact"),
    prompt_template=(
        "根据用户问题与真实字段识别分组、连续变量、类别变量或时间维度，完成差异、关系或趋势探索；"
        "该模板只提供可复用起点，具体方法、假设检验和可视化必须由 Agent 按数据动态调整。"
    ),
    renderer="table+comparison",
    code_template=GENERAL_CODE,
)
