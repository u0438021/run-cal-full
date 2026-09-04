import re
from pathlib import Path

from app import models  # noqa: F401
from app.database import Base


def test_models_cover_every_starter_ddl_table() -> None:
    schema_file = Path(__file__).resolve().parents[3] / "infra" / "sql" / "001_init.sql"
    ddl = schema_file.read_text(encoding="utf-8")
    ddl_tables = set(re.findall(r"CREATE TABLE (\w+)", ddl))

    assert set(Base.metadata.tables) == ddl_tables


def test_activity_sample_model_preserves_power_provenance() -> None:
    columns = Base.metadata.tables["activity_samples"].columns

    assert {"native_power_w", "stryd_power_w", "power_w", "power_source"} <= set(columns.keys())


def test_import_job_tracks_reprocessing_state() -> None:
    columns = Base.metadata.tables["import_jobs"].columns

    assert {"status", "attempts", "parser_version", "warnings", "error_code"} <= set(columns.keys())
