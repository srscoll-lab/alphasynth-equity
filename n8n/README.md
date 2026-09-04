# Research Dossier workflows

`alphasynth-dossier-intake-v1.json` is the inactive, importable entry workflow for the pilot.
It validates the application request and creates separate official-evidence and social-discovery
plans. It deliberately does not replace or activate the live BMS workflows.

The downstream workflows named in its output must be implemented and tested before this webhook
is configured as `DOSSIER_WEBHOOK_URL` in Cloud Run.
