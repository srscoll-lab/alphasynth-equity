from datetime import datetime, timezone

import typer
from rich.console import Console
from rich.table import Table

from .db import init_db
from .schemas import CollectedItem
from .services import get_status, ingest, process_pending

app = typer.Typer(help="AI Stock Intelligence CLI")
console = Console()


@app.command("init-db")
def init_database() -> None:
    init_db()
    console.print("[green]Database initialised.[/green]")


@app.command("ingest-sample")
def ingest_sample() -> None:
    samples = [
        CollectedItem(
            source_type="research_community",
            source_name="Sample Value Research",
            external_id="sample-001",
            published_at=datetime.now(timezone.utc),
            title="Example long-form thesis",
            raw_text=(
                "The company may deserve further study because earnings growth has accelerated, "
                "cash flow conversion has improved, and management guidance indicates margin expansion. "
                "The principal risk is a demanding valuation and dependence on one customer segment."
            ),
        ),
        CollectedItem(
            source_type="social",
            source_name="Sample Social Feed",
            external_id="sample-002",
            published_at=datetime.now(timezone.utc),
            title="Example structured tip",
            raw_text="BUY ABC at 100, target 115, stop loss 94.",
        ),
    ]

    for sample in samples:
        stored, result = ingest(sample)
        console.print(f"{sample.external_id}: {'stored' if stored else result}")


@app.command("process")
def process(limit: int = typer.Option(100, min=1, max=1000)) -> None:
    counts = process_pending(limit=limit)
    console.print(counts)


@app.command("status")
def status() -> None:
    values = get_status()
    table = Table(title="Stock Intelligence Status")
    table.add_column("Metric")
    table.add_column("Value", justify="right")
    for key, value in values.items():
        table.add_row(key, str(value))
    console.print(table)


if __name__ == "__main__":
    app()
