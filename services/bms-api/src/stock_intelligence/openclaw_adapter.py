import json
import subprocess
import tempfile
from pathlib import Path

from .config import settings
from .schemas import AIExtractionResult, NormalisedItem


class OpenClawDisabledError(RuntimeError):
    pass


def analyse_with_openclaw(item: NormalisedItem) -> AIExtractionResult:
    if not settings.openclaw_enabled:
        raise OpenClawDisabledError(
            "OpenClaw is disabled. Set OPENCLAW_ENABLED=true only after the rule pipeline is tested."
        )

    payload = {
        "task": "extract_stock_recommendation",
        "output_schema": AIExtractionResult.model_json_schema(),
        "item": item.model_dump(mode="json"),
    }

    with tempfile.TemporaryDirectory() as tmp:
        request_path = Path(tmp) / "request.json"
        request_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

        # Placeholder command contract. We will align this with the exact OpenClaw
        # agent invocation after defining the local stock-research agent.
        command = [
            settings.openclaw_command,
            "agent",
            "run",
            settings.openclaw_agent_name,
            "--input-file",
            str(request_path),
            "--json",
        ]

        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=settings.openclaw_timeout_seconds,
            check=False,
        )

        if completed.returncode != 0:
            raise RuntimeError(
                f"OpenClaw failed with exit code {completed.returncode}: {completed.stderr.strip()}"
            )

        try:
            return AIExtractionResult.model_validate_json(completed.stdout)
        except Exception as exc:
            raise RuntimeError("OpenClaw did not return valid extraction JSON.") from exc
