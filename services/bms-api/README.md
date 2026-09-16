# AI Stock Intelligence MVP

A low-cost, AI-last personal research platform.

## Architecture

```text
Sources
  -> Collectors
  -> Raw data store
  -> Normalisation
  -> Deduplication
  -> Rule-based AI gate
  -> OpenClaw only when needed
  -> Gemini via Vertex AI
  -> Structured analysis
  -> Watchlist
```

## Current Sprint

Sprint 2A: Foundation implementation

Included:

- Python project scaffold
- SQLAlchemy database layer
- Raw source and recommendation models
- Normalisation and deduplication
- Rule-based AI decision gate
- OpenClaw command adapter
- CLI commands
- Initial PostgreSQL schema
- Basic tests

## Quick start

```bash
python -m venv .venv
```

Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

Install:

```bash
pip install -e .[dev]
```

Create configuration:

```bash
copy .env.example .env
```

Initialise the local database:

```bash
stockintel init-db
```

Load sample messages:

```bash
stockintel ingest-sample
```

Process pending messages:

```bash
stockintel process
```

Show database counts:

```bash
stockintel status
```

## Database

Local development defaults to SQLite:

```env
DATABASE_URL=sqlite:///./stock_intelligence.db
```

Production can use PostgreSQL or Supabase:

```env
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/postgres
```

## OpenClaw

OpenClaw is disabled by default.

Enable it only after the deterministic pipeline works:

```env
OPENCLAW_ENABLED=true
OPENCLAW_COMMAND=openclaw
```

The current adapter writes a compact JSON request to a temporary file and invokes a configurable OpenClaw command. The exact agent command will be finalised after the local OpenClaw agent is defined.

## Cost controls

- No LLM call during collection
- No LLM call for duplicates
- No LLM call for clearly structured messages
- Compact excerpts only
- Configurable maximum messages per run
- OpenClaw disabled by default
- Every AI decision is logged
