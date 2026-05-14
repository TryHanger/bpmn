from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = Field(default="Flowable BPM Backend", alias="APP_NAME")
    app_version: str = Field(default="1.0.0", alias="APP_VERSION")
    app_host: str = Field(default="0.0.0.0", alias="APP_HOST")
    app_port: int = Field(default=8000, alias="APP_PORT")

    database_url: str = Field(alias="DATABASE_URL")
    auto_create_tables: bool = Field(default=True, alias="AUTO_CREATE_TABLES")

    flowable_base_url: str = Field(alias="FLOWABLE_BASE_URL")
    flowable_username: str = Field(default="rest-admin", alias="FLOWABLE_USERNAME")
    flowable_password: str = Field(default="test", alias="FLOWABLE_PASSWORD")

    frontend_origin: str = Field(default="http://localhost:3001", alias="FRONTEND_ORIGIN")

    jwt_secret_key: str = Field(default="change-me", alias="JWT_SECRET_KEY")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    access_token_exp_minutes: int = Field(default=15, alias="ACCESS_TOKEN_EXP_MINUTES")
    refresh_token_exp_days: int = Field(default=30, alias="REFRESH_TOKEN_EXP_DAYS")


@lru_cache
def get_settings() -> Settings:
    return Settings()
