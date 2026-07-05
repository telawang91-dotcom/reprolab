from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR.parent / ".env", BACKEND_DIR / ".env"),
        extra="ignore",
        protected_namespaces=("settings_",),
    )

    app_name: str = "ReproLab"
    api_prefix: str = "/api/v1"
    database_url: str = "postgresql+psycopg://reprolab:reprolab@localhost:5432/reprolab"
    storage_dir: Path = BACKEND_DIR / "storage"
    embedding_model: str = "BAAI/bge-m3"
    embedding_preload: bool = True
    reranker_model: str = "BAAI/bge-reranker-v2-m3"
    llm_base_url: str = "https://api.deepseek.com/v1"
    llm_api_key: str = ""
    llm_model: str = "deepseek-chat"
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    deepseek_api_key: str = ""
    hunyuan_base_url: str = "https://api.hunyuan.cloud.tencent.com/v1"
    hunyuan_api_key: str = ""
    claude_api_key: str = ""
    planner_model: str = "deepseek:deepseek-chat"
    executor_model: str = "deepseek:deepseek-chat"
    critic_model: str = "deepseek:deepseek-chat"
    model_max_retries: int = Field(default=2, ge=0, le=5)
    agent_max_steps: int = Field(default=10, ge=1, le=30)
    llm_temperature: float = Field(default=0.2, ge=0, le=2)
    llm_max_tokens: int = Field(default=4096, ge=64, le=32768)
    siliconflow_enable_thinking: bool = False
    nli_support_threshold: float = Field(default=0.6, ge=0, le=1)
    repair_max_iterations: int = Field(default=2, ge=1, le=5)
    sandbox_backend: str = "docker"
    sandbox_image: str = "reprolab-sandbox:py311"
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def agent_model_route(self) -> dict[str, str]:
        return {
            "planner": self.planner_model,
            "executor": self.executor_model,
            "critic": self.critic_model,
        }


settings = Settings()
