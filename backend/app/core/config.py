from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent


def resolve_model_reference(value: str) -> str:
    """Resolve repository-local model paths without changing Hugging Face ids."""
    candidate = Path(value).expanduser()
    if candidate.is_absolute():
        return str(candidate)
    repository_candidate = REPO_DIR / candidate
    if repository_candidate.exists():
        return str(repository_candidate.resolve())
    return value


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
    rerank_limit: int = Field(default=12, ge=5, le=50)
    llm_base_url: str = "https://api.deepseek.com/v1"
    llm_api_key: str = ""
    llm_model: str = "deepseek-v4-flash"
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    deepseek_api_key: str = ""
    hunyuan_base_url: str = "https://api.hunyuan.cloud.tencent.com/v1"
    hunyuan_api_key: str = ""
    claude_api_key: str = ""
    planner_model: str = "deepseek:deepseek-v4-flash"
    executor_model: str = "deepseek:deepseek-v4-flash"
    critic_model: str = "deepseek:deepseek-v4-pro"
    model_max_retries: int = Field(default=2, ge=0, le=5)
    agent_max_steps: int = Field(default=10, ge=1, le=30)
    agent_api_token: str = ""
    agent_rate_limit_per_minute: int = Field(default=30, ge=1, le=1000)
    agent_max_concurrent_jobs: int = Field(default=2, ge=1, le=32)
    llm_temperature: float = Field(default=0.2, ge=0, le=2)
    llm_max_tokens: int = Field(default=4096, ge=64, le=32768)
    siliconflow_enable_thinking: bool = False
    nli_support_threshold: float = Field(default=0.6, ge=0, le=1)
    repair_max_iterations: int = Field(default=2, ge=1, le=5)
    sandbox_backend: str = "docker"
    sandbox_image: str = "reprolab-sandbox:py311"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

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

    @property
    def resolved_embedding_model(self) -> str:
        return resolve_model_reference(self.embedding_model)

    @property
    def resolved_reranker_model(self) -> str:
        return resolve_model_reference(self.reranker_model)


settings = Settings()
