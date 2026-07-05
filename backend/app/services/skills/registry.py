import uuid
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class SkillPack:
    id: uuid.UUID
    name: str
    discipline: str
    tools: tuple[str, ...]
    prompt_template: str
    renderer: str
    code_template: str


class SkillRegistry:
    def __init__(self) -> None:
        self._packs: dict[uuid.UUID, SkillPack] = {}

    def register(self, pack: SkillPack) -> SkillPack:
        self._packs[pack.id] = pack
        return pack

    def list(self, discipline: str | None = None) -> list[SkillPack]:
        values = self._packs.values()
        return sorted(
            (item for item in values if discipline is None or item.discipline == discipline),
            key=lambda item: (item.discipline, item.name),
        )

    def get(self, skill_id: uuid.UUID) -> SkillPack | None:
        return self._packs.get(skill_id)


registry = SkillRegistry()
