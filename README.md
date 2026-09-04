# Running Data Analytics

Running-only MVP for importing FIT activities, normalizing Garmin/Stryd data, calculating training analytics, projecting 30-day fitness, and generating evidence-based AI insights.

## Start here

- [Product requirements](docs/PRD.md)
- [System architecture](docs/ARCHITECTURE.md)
- [Database schema](docs/DATABASE.md)
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [FIT field specification](docs/FIT_FIELD_MAPPING.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [Office computer setup](docs/OFFICE_SETUP.md)
- [Firebase invitation hotfix](docs/FIREBASE_INVITE_HOTFIX.md)

## Repository map

```text
apps/web/                 Next.js dashboard and login
services/api/             FastAPI API, imports, analytics, AI insight contracts
packages/contracts/       Shared API/domain contracts
infra/                    Local PostgreSQL and deployment scaffolding
docs/                     Product and engineering specifications
```

## Local development

Prerequisites: Node 20+, pnpm 9+, Python 3.12+, Docker.

```bash
copy .env.example .env
docker compose up -d db
cd services/api
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

In another terminal:

```bash
cd apps/web
pnpm install
pnpm dev
```

API health: `http://localhost:8000/health`. Web: `http://localhost:3000`.

## MVP guardrails

- Running activities only; non-running FIT files are rejected with a clear reason.
- Original FIT files are retained privately for reprocessing and audit.
- Raw decoded fields are retained alongside normalized values.
- Stryd fields are resolved by developer-data metadata, not fixed field numbers.
- Projections are estimates with confidence and assumptions, never medical advice.
