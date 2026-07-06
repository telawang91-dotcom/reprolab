from typing import Literal

from pydantic import BaseModel, Field, field_validator


ModelProvider = Literal["deepseek", "hunyuan", "custom"]


class ModelConfigRead(BaseModel):
    provider: ModelProvider
    base_url: str
    analysis_model: str
    review_model: str
    api_key_configured: bool
    api_key_hint: str | None = None


class ModelConfigUpdate(BaseModel):
    provider: ModelProvider
    base_url: str = Field(min_length=8, max_length=500)
    analysis_model: str = Field(min_length=1, max_length=200)
    review_model: str = Field(min_length=1, max_length=200)
    api_key: str | None = Field(default=None, max_length=500)

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        clean = value.strip().rstrip("/")
        if any(character.isspace() for character in clean):
            raise ValueError("服务地址不能包含空格或换行")
        if not clean.startswith(("https://", "http://")):
            raise ValueError("服务地址必须以 http:// 或 https:// 开头")
        return clean

    @field_validator("analysis_model", "review_model")
    @classmethod
    def validate_model(cls, value: str) -> str:
        clean = value.strip()
        if ":" in clean or any(character.isspace() for character in clean):
            raise ValueError("模型名称不能包含冒号、空格或换行")
        return clean

    @field_validator("api_key")
    @classmethod
    def normalize_key(cls, value: str | None) -> str | None:
        clean = value.strip() if value else ""
        if any(character.isspace() for character in clean):
            raise ValueError("API Key 不能包含空格或换行")
        return clean or None


class ModelTestResult(BaseModel):
    ok: bool
    message: str
    model: str
    latency_ms: int
