# Research Dossier workflows

`alphasynth-dossier-intake-v1.json` is the inactive, importable entry workflow for the pilot.
It validates the application request and creates separate official-evidence and social-discovery
plans. It deliberately does not replace or activate the live BMS workflows.

The downstream workflows named in its output must be implemented and tested before production use.
This intake webhook returns a discovery plan, not a completed dossier, and therefore must **not**
be configured as `DOSSIER_WEBHOOK_URL`. That variable must point to a future orchestration workflow
that runs discovery, reading, admission, classification, aggregation, and assembly and returns the
canonical `ResearchDossier` payload.

`official-source-admission-v1.json` is the deterministic trust gate for discovered URLs. It
requires verified company domains, rejects undated and post-cutoff material, blocks lookalike
domains, removes duplicates, and ranks regulator/exchange sources ahead of company sources.

`market-conversation-aggregation-v1.json` accepts classified public opinions, rejects malformed
or duplicate records, discounts possible sarcasm, and computes sentiment and themes without an
AI-written narrative. Fewer than five items or fewer than two sources produces
`insufficient_data`. Its output is structurally prohibited from affecting BMS.

`dossier-assembly-qc-v1.json` produces the canonical camel-case application payload. It checks
source-reference integrity, downgrades unsupported claims to `insufficient_evidence`, counts
conflicts, identifies thin evidence, and keeps human review enabled for the pilot.

`market-conversation-intake-v1.json` is the pilot's public-source and privacy boundary. Version 1
admits only public ValuePickr and Substack URLs, enforces the evidence cutoff, strips author
handles, limits retained text, and rejects private/login URLs before classification.

The application route `POST /api/dossier/classify-opinions` performs constrained classification
for admitted items. It requires `x-dossier-token` matching `DOSSIER_INTERNAL_TOKEN`, accepts no
author identity, caps batches at 50 records, and returns labels rather than narrative. n8n must
send the token as a credential-backed header; it must never be stored in a workflow export.

`market-conversation-classifier-connector-v1.json` performs that private call and validates both
the sanitized input and structured classifier response. It reads the application URL and token
from n8n environment variables and contains no secret value.
