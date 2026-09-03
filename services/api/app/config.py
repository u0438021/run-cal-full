from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../../.env", extra="ignore")

    database_url: str = "postgresql+psycopg://run:run@localhost:5432/run_analytics"
    session_secret: str = "development-only-change-me"
    pin_pepper: str = "development-only-change-me"
    fit_storage_path: str = "./var/fit"
    web_origin: str = "http://localhost:3000"


settings = Settings()

