# Backend

FastAPI backend for saving BPMN XML templates into PostgreSQL and deploying them to Flowable.

## What it does

- uploads BPMN XML and stores it as draft template version
- parses process id and name from BPMN XML
- deploys XML to Flowable REST
- stores deployment id, process definition id, Flowable version, and XML snapshot in PostgreSQL

## Environment

Copy `.env.example` to `.env` and adjust values.

The backend creates tables automatically on startup with `Base.metadata.create_all(...)` when `AUTO_CREATE_TABLES=true`.

## Run locally

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## API

- `GET /api/health`
- `POST /api/templates/upload`
- `GET /api/templates`
- `GET /api/templates/{template_id}`
- `POST /api/templates/{template_id}/deploy`
