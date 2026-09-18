#!/usr/bin/env bash

# One-command Cloud Shell runner for the controlled 50-company BMS evidence pass.
# It preserves production traffic, checkpoints every company, merges only rows
# that pass the deterministic evidence contract, and prints the frontend API view.

set -u

PROJECT="${PROJECT:-my-nse-research-app}"
REGION="${REGION:-us-central1}"
BRANCH="${BRANCH:-codex/server-dossier-pdf}"
REPO_ROOT="${REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
CUTOFF="${CUTOFF:-2026-08-25}"
STAMP="$(date -u +%m%d%H%M%S)"
BMS_PILOT_URL="https://bms-evidence-pilot---bms-api-oqc2y4ogda-uc.a.run.app"
ALPHA_PILOT_URL="https://expectation-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app"
OUTPUT_FILE="$REPO_ROOT/output/bms-cohort50-evidence.csv"

fail() {
  printf 'FAILED: %s\n' "$1" >&2
  exit 1
}

cd "$REPO_ROOT" || fail "Repository not found at $REPO_ROOT"
git fetch origin "$BRANCH" || fail "Unable to fetch $BRANCH"
git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" FETCH_HEAD \
  || fail "Unable to check out $BRANCH"
git pull --ff-only origin "$BRANCH" || fail "Local branch cannot fast-forward; preserve local changes and resolve before rerunning"

printf '\n[1/6] Deploying the restored BMS baseline with the 50-company source registry...\n'
gcloud run deploy bms-api \
  --source=services/bms-api \
  --project="$PROJECT" \
  --region="$REGION" \
  --revision-suffix="cohort50base$STAMP" \
  --tag=bms-evidence-pilot \
  --no-traffic \
  || fail "BMS baseline deployment failed"

curl -fsS "$BMS_PILOT_URL/health" | jq . \
  || fail "BMS baseline health check failed"

printf '\n[2/6] Deploying the AlphaSynth proxy against that baseline...\n'
gcloud run deploy alphasynth-equity \
  --source=. \
  --project="$PROJECT" \
  --region="$REGION" \
  --revision-suffix="cohort50proxy$STAMP" \
  --tag=expectation-pilot \
  --no-traffic \
  --update-env-vars="BMS_API_URL=$BMS_PILOT_URL" \
  || fail "AlphaSynth proxy deployment failed"

printf '\n[3/6] Loading the internal research token and controlled ticker list...\n'
export DOSSIER_INTERNAL_TOKEN
DOSSIER_INTERNAL_TOKEN="$(gcloud secrets versions access latest \
  --secret=dossier-internal-token --project="$PROJECT")" \
  || fail "Unable to read dossier-internal-token"
TICKERS="$(node -e "const x=require('./scripts/stop-line-universe-companies.json');process.stdout.write(x.companies.map(c=>c.ticker).join(','))")" \
  || fail "Unable to load the controlled cohort"
mkdir -p "$REPO_ROOT/output"

printf '\n[4/6] Collecting missing evidence. Existing checkpoints are resumed automatically...\n'
npm run collect:bms-factor-evidence -- \
  --base-url="$ALPHA_PILOT_URL" \
  --cutoff="$CUTOFF" \
  --tickers="$TICKERS" \
  --request-timeout-ms=360000 \
  --max-attempts=2 \
  --concurrency=3 \
  --output="$OUTPUT_FILE" \
  || fail "Evidence collection stopped; rerun this script to resume from its checkpoint"

printf '\n[5/6] Merging only contract-valid rows and redeploying the populated BMS ledger...\n'
npm run merge:bms-factor-evidence -- --input="$OUTPUT_FILE" \
  || fail "Evidence merge failed"

gcloud run deploy bms-api \
  --source=services/bms-api \
  --project="$PROJECT" \
  --region="$REGION" \
  --revision-suffix="cohort50data$STAMP" \
  --tag=bms-evidence-pilot \
  --no-traffic \
  || fail "Populated BMS deployment failed"

printf '\n[6/6] Reading the exact lifecycle payload consumed by the frontend...\n'
curl -fsS "$ALPHA_PILOT_URL/api/bms/lifecycle" | jq '{
  publishedCompanies: .company_count,
  monitoredCompanies: .monitored_company_count,
  excludedPendingRepair: .excluded_company_count,
  stageCounts: .stage_counts,
  companies: [.companies[] | {
    symbol,
    lifecycle: .lifecycle_stage,
    qualification: .lifecycle_qualification,
    bms,
    completeFactors: .publication_eligibility.completeFactorIds,
    missingFactors: .publication_eligibility.missingFactorIds
  }],
  repairQueue: .repair_queue_summary
}'

printf '\nEvidence checkpoint: %s\n' "$OUTPUT_FILE"
printf 'Merge audit: %s\n' "$REPO_ROOT/services/bms-api/src/stock_intelligence/bms_launch_factor_evidence.csv.merge-audit.json"
