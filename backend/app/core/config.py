from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR.parent / ".env", BACKEND_DIR / ".env"),
        extra="ignore",
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
    sandbox_backend: str = "docker"
    sandbox_image: str = "reprolab-sandbox:py311"
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


settings = Settings()
