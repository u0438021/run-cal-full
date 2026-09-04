# Continue Development on the Office Computer

## What is stored in GitHub

- Current Next.js web application, FastAPI service, database schema, tests, and project documents.
- FIT parser updates for Garmin and Stryd data.
- Email-delivery verification status, without Gmail credentials or PINs.

## What is not stored in GitHub

- Gmail App Password and sender value. Production functions read these from Google Secret Manager.
- Local `.env`, virtual environments, package caches, and generated files.
- Usernames, PINs, recovery links, and invitation links.

## Office computer setup

Prerequisites: Git, Node.js 20+, pnpm 9+, Python 3.12+, uv, Docker Desktop, and Codex.

```powershell
git clone https://github.com/u0438021/run-cal-full.git
cd run-cal-full
Copy-Item .env.example .env
docker compose up -d db
cd services/api
uv sync --extra dev
uv run pytest
```

Start the API:

```powershell
cd services/api
uv run uvicorn app.main:app --reload
```

Start the web application in another terminal:

```powershell
cd apps/web
pnpm install
pnpm dev
```

- Local web: `http://localhost:3000`
- Local API health check: `http://localhost:8000/health`
- Production application: `https://run-cal-th.web.app/`

## Accounts

- Sign in to Codex and GitHub with the accounts that can access this repository.
- For production administration, use the Google account that owns the `run-cal-th` project.
- Never copy a Gmail App Password or a PIN into project files or chat.

## Continue in Codex

Open the cloned `run-cal-full` folder, return to this thread if available, and say:

> Continue RUN|CAL from the Office computer.

