from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./stock_intelligence.db"

    openclaw_enabled: bool = False
    openclaw_command: str = "openclaw"
    openclaw_agent_name: str = "stock-research"
    openclaw_timeout_seconds: int = 120

    max_ai_items_per_run: int = 5
    min_text_length_for_ai: int = 180
    ai_novelty_threshold: float = 0.65
    log_level: str = "INFO"

    google_cloud_project: str | None = None
    vertex_location: str = "us-central1"
    gemini_model: str = "gemini-2.5-flash"

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )


settings = Settings()