import uuid

from app.services.skills.builtin.general_ds import GENERAL_CODE
from app.services.skills.registry import SkillPack

MATERIALS_CHARACTERIZATION = SkillPack(
    id=uuid.UUID("10000000-0000-5000-8000-000000000002"),
    name="材料表征批次对比",
    discipline="materials",
    tools=("pandas", "scipy", "matplotlib", "emit_artifact"),
    prompt_template="识别材料批次、处理条件和连续表征指标；优先比较批次分布与显著性，但仍应服从用户的动态分析请求。",
    renderer="materials-comparison",
    code_template=GENERAL_CODE,
)
