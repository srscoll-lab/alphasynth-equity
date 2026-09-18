# AlphaSynth BMS Multi-Agent Ingestion Architecture

## 1. Purpose

This document defines a scalable multi-agent architecture for expanding AlphaSynth's Business Momentum Signal (BMS) coverage from the current evidence-qualified cohort toward the complete monitored universe and, eventually, toward underresearched mid-cap and smaller companies.

The system is designed to achieve four objectives simultaneously:

1. increase evidence coverage without weakening the BMS methodology;
2. parallelize document retrieval and evidence preparation;
3. keep scoring deterministic and auditable; and
4. prevent incomplete or inconsistent evidence from entering the published BMS universe.

The central design principle is:

> Sector-oriented agents produce candidate evidence. Independent task-oriented controls decide whether that evidence may be used. Deterministic code calculates the score and lifecycle.

No agent is permitted to invent a value, estimate a missing comparison, silently convert missing evidence into neutral evidence, or publish its own unvalidated output.

---

## 2. Important distinction: roles, agents, workstreams and slots

Four terms must be kept separate.

### 2.1 Logical role

A logical role is a responsibility in the pipeline, such as retrieval, extraction, mapping, validation or exception resolution.

Logical roles describe **what must happen**. They do not necessarily require a permanently separate agent.

### 2.2 Agent instance

An agent instance is an actual worker executing one or more logical roles during a particular run.

For example, one sector agent may perform retrieval, extraction and mapping sequentially for its assigned companies. In a higher-capacity environment, those three roles could be assigned to three separate agents.

### 2.3 Workstream

A workstream is a controlled queue of companies that share similar reporting structures, source types and financial vocabulary. Examples include Banks and NBFCs, IT Services, or Industrials.

A workstream is not merely a label. It must have:

- an assigned worker agent;
- a controlled company list;
- a sector metric dictionary;
- source-discovery rules;
- checkpoint and output locations; and
- explicit completion and rejection criteria.

### 2.4 Concurrency slot

A concurrency slot is one simultaneously running agent capacity.

With four available slots, the practical operating model is:

- one lead/orchestrator slot; and
- up to three worker slots.

The three worker slots are reused across successive phases. The system does not require all conceptual roles to run simultaneously.

---

## 3. Recommended operating model

The recommended model is a hybrid:

- **sector-oriented agents** perform company data work; and
- **task-oriented agents** independently validate, resolve exceptions and audit releases.

### 3.1 Production wave

During a production wave, three sector agents can operate concurrently:

```text
Lead Orchestrator
|
+-- Sector Agent A: assigned sector/company batch
+-- Sector Agent B: assigned sector/company batch
+-- Sector Agent C: assigned sector/company batch
```

Each sector agent performs the following logical steps for its assigned companies:

```text
Retrieve official documents
        |
        v
Extract explicit observations
        |
        v
Map observations to the four BMS factors
        |
        v
Write candidate evidence and diagnostics
```

### 3.2 Control wave

When the production wave completes, the available worker slots are reassigned:

```text
Candidate Evidence
|
+-- Independent Validation Agent
+-- Exception-Resolution Agent
+-- Release-Audit Agent
```

These roles may run concurrently when their inputs are independent, or sequentially when one depends on another.

### 3.3 Why one agent should not approve its own output

The sector agent knows the company context and is optimized for evidence discovery. This creates a risk of accepting a plausible but non-comparable value. An independent validator provides separation of duties.

The producing agent may propose evidence. It may not decide that the evidence is publishable.

---

## 4. High-level system topology

```text
                         +----------------------+
                         |   Lead Orchestrator  |
                         +----------+-----------+
                                    |
                                    v
                         +----------------------+
                         |    Shared Harness    |
                         +----------+-----------+
                                    |
                 +------------------+------------------+
                 |                  |                  |
                 v                  v                  v
        +----------------+ +----------------+ +----------------+
        | Sector Agent A | | Sector Agent B | | Sector Agent C |
        +--------+-------+ +--------+-------+ +--------+-------+
                 |                  |                  |
                 +------------------+------------------+
                                    |
                                    v
                         +----------------------+
                         | Candidate Evidence   |
                         | Ledger + Diagnostics |
                         +----------+-----------+
                                    |
                                    v
                         +----------------------+
                         | Independent Validator|
                         +-----+-----------+----+
                               |           |
                            PASS|           |FAIL
                               v           v
                    +-------------+   +----------------+
                    | Qualified   |   | Exception Queue|
                    | Evidence    |   +-------+--------+
                    +------+------+           |
                           |                  v
                           |          +------------------+
                           |          | Exception Agent  |
                           |          +--------+---------+
                           |                   |
                           |                   +--> revalidation
                           v
                    +----------------+
                    | Deterministic  |
                    | BMS Scoring    |
                    +-------+--------+
                            |
                            v
                    +----------------+
                    | Release Auditor|
                    +-------+--------+
                            |
                            v
                    +----------------+
                    | API + Frontend |
                    +----------------+
```

---

## 5. Shared harness

Every agent must receive the same harness. The harness is the governing contract for the run.

### 5.1 Run manifest

Every run must have an immutable manifest containing at least:

```yaml
run_id: bms-ingestion-YYYYMMDD-NNN
methodology_version: BMS_V1_1_FOUR_FACTOR
information_cutoff: YYYY-MM-DD
company_universe_version: string
company_batch:
  - symbol: string
    company_name: string
    exchange: NSE | BSE | BOTH
    sector_family: string
    official_domains: [string]
required_factors:
  - earnings
  - economics
  - execution
  - balance_sheet
publication_policy:
  minimum_complete_factors: 4
  minimum_coverage_weight: 1.0
  mandatory_factors:
    - earnings
    - economics
    - execution
    - balance_sheet
source_policy_version: string
metric_dictionary_version: string
```

The run manifest must not change while a batch is running. A changed cutoff, company list or methodology requires a new run ID.

### 5.2 Company identity registry

Each company record should include:

- canonical symbol;
- canonical legal name;
- exchange identifiers;
- ISIN, when available;
- known historical symbols;
- official website domains;
- investor-relations URL;
- sector family;
- reporting currency;
- financial-year convention; and
- consolidation preference.

The identity registry prevents evidence from a parent, subsidiary, similarly named issuer or old symbol from being assigned to the wrong company.

### 5.3 Permitted source hierarchy

The preferred hierarchy is:

1. NSE or BSE corporate filing;
2. company regulatory filing;
3. company results release;
4. company investor presentation;
5. company annual report;
6. company earnings-call transcript;
7. approved structured secondary source for explicitly permitted fields only.

Search-engine result pages, snippets and AI-generated summaries are discovery aids, not final evidence.

Every admitted observation must preserve the final retrievable evidence URL or archived document reference.

### 5.4 Common period rules

Every comparison must declare:

- previous period;
- current period;
- previous period-end date;
- current period-end date;
- comparison basis;
- consolidated or standalone basis;
- reported or derived status; and
- publication date.

Permitted comparison bases should include:

- same quarter prior year;
- sequential quarter, only where methodologically appropriate;
- same financial year prior year;
- latest reported balance-sheet comparison; and
- explicitly defined event-to-event comparison.

The system must not compare a quarterly value with a year-to-date value, consolidated with standalone results, or differing units without an explicit, validated conversion rule.

### 5.5 Canonical units

Examples include:

- INR crore;
- percent;
- basis points;
- times;
- units;
- tonnes;
- megawatts;
- million subscribers;
- square feet; and
- days.

The raw source unit must be retained even when a normalized unit is added.

### 5.6 Shared rejection codes

Agents must use controlled rejection codes rather than free-form failure descriptions alone.

Suggested codes:

```text
company_identity_mismatch
source_not_permitted
source_not_retrievable
source_publication_date_missing
post_cutoff_source
document_corrupt
document_requires_ocr
metric_not_explicit
metric_mapping_mismatch
period_not_comparable
consolidation_basis_mismatch
unit_missing
unit_mismatch
direction_semantics_unknown
duplicate_observation
contradictory_official_sources
insufficient_factor_evidence
genuine_non_disclosure
provider_rate_limited
technical_failure
```

---

## 6. Sector-oriented production agents

Sector agents operate on controlled company batches and use a sector-specific metric dictionary.

### 6.1 Banks and NBFCs

Typical evidence vocabulary:

- assets under management;
- loan growth;
- deposits;
- net interest margin;
- spreads;
- cost-to-income;
- gross and net NPA;
- Stage 3 assets;
- credit cost;
- provision coverage;
- capital adequacy;
- CET1;
- liquidity; and
- customer franchise.

Balance-sheet and asset-quality evidence should normally remain mandatory for financial companies.

### 6.2 IT and digital services

Typical evidence vocabulary:

- total contract value;
- large-deal wins;
- bookings;
- client additions;
- client growth;
- utilization;
- attrition;
- headcount;
- pricing;
- operating margin;
- revenue by vertical or geography; and
- cash conversion.

### 6.3 Industrials, capital goods and infrastructure

Typical evidence vocabulary:

- order inflow;
- order book;
- project execution;
- commissioning;
- capacity additions;
- utilization;
- volume;
- milestone delivery;
- working capital;
- receivable days;
- net debt; and
- operating cash flow.

### 6.4 Pharmaceuticals and healthcare

Typical evidence vocabulary:

- sales volume;
- product launches;
- specialty or innovative medicine sales;
- facility utilization;
- regulatory status;
- geographic mix;
- R&D expenditure;
- EBITDA margin;
- working capital; and
- cash conversion.

Regulatory events may be contextual evidence but must not be converted into a numeric factor without an explicit scoring rule.

### 6.5 Consumer, retail and automobiles

Typical evidence vocabulary:

- unit volume;
- realization;
- market share;
- same-store sales;
- store count;
- distribution reach;
- product mix;
- gross or operating margin;
- inventory;
- working capital; and
- net cash or debt.

### 6.6 Metals, energy and other specialist sectors

Typical evidence vocabulary:

- production volume;
- sales volume;
- realization;
- input cost;
- capacity utilization;
- plant availability;
- reserves or resources where explicitly comparable;
- operating margin;
- net debt;
- leverage; and
- operating cash flow.

### 6.7 Sector-agent input

```json
{
  "runId": "string",
  "informationCutoff": "YYYY-MM-DD",
  "sectorFamily": "string",
  "companies": [
    {
      "symbol": "string",
      "companyName": "string",
      "officialDomains": ["string"],
      "reportingPeriod": "string"
    }
  ],
  "sourcePolicyVersion": "string",
  "metricDictionaryVersion": "string",
  "outputLocation": "string",
  "checkpointLocation": "string"
}
```

### 6.8 Sector-agent output

The sector agent must produce:

1. candidate evidence rows;
2. document inventory;
3. per-company diagnostic summary;
4. rejection records;
5. checkpoint state; and
6. a completion manifest.

The output must not contain a publication decision.

---

## 7. Logical tasks inside a sector pod

### 7.1 Retrieval

The retrieval role:

- finds official documents;
- confirms company identity;
- records publication date;
- checks the information cutoff;
- downloads or archives the document;
- calculates a document hash;
- records retrieval time and HTTP outcome; and
- avoids redownloading an unchanged document.

Retrieval should be idempotent. Repeating the same run against the same source should not create a second logical document.

### 7.2 Extraction

The extraction role:

- extracts explicitly reported values only;
- retains source wording;
- captures previous and current periods;
- records units;
- records page or section location where possible;
- marks consolidated or standalone basis;
- preserves the exact source reference; and
- emits no value when the document does not explicitly support one.

AI may assist extraction, but deterministic validation must subsequently verify the structure and comparison contract.

### 7.3 Sector mapping

The mapping role assigns an extracted observation to one of:

- `earnings`;
- `economics`;
- `execution`;
- `balance_sheet`; or
- `unmapped`.

Mapping must use the versioned sector dictionary. An unfamiliar metric should be marked `unmapped`; it should not be forced into the nearest factor.

### 7.4 Small-batch and scale modes

In small-batch mode, a single sector agent may perform retrieval, extraction and mapping for efficiency.

In scale mode, these responsibilities may be separated across agents or services. Regardless of execution mode, the output contract remains identical.

---

## 8. Canonical candidate evidence schema

A candidate evidence row should contain at least:

```json
{
  "run_id": "string",
  "company_symbol": "string",
  "company_name": "string",
  "factor_id": "earnings | economics | execution | balance_sheet",
  "metric_name": "canonical_metric_name",
  "source_metric_label": "verbatim source label",
  "previous_period": "string",
  "current_period": "string",
  "previous_period_end_date": "YYYY-MM-DD",
  "current_period_end_date": "YYYY-MM-DD",
  "previous_value": 0.0,
  "current_value": 0.0,
  "raw_unit": "string",
  "canonical_unit": "string",
  "comparison_basis": "same-quarter-prior-year",
  "consolidation_basis": "consolidated | standalone | not_applicable",
  "source_url": "string",
  "archived_document_uri": "string",
  "document_sha256": "string",
  "source_type": "string",
  "published_at": "YYYY-MM-DD",
  "captured_at": "ISO-8601 timestamp",
  "information_cutoff": "YYYY-MM-DD",
  "source_page": "string or null",
  "extraction_method": "structured | text | ocr | human_review",
  "producer_agent_id": "string",
  "producer_confidence": 0.0,
  "publication_status": "candidate"
}
```

The candidate schema intentionally does not contain a BMS score or lifecycle decision.

---

## 9. Independent validation agent

The validator operates on candidate evidence without relying on the producing agent's conclusion.

### 9.1 Validation sequence

Validation should occur in the following order:

1. schema validity;
2. company identity;
3. source admissibility;
4. cutoff compliance;
5. source retrievability or archived-document integrity;
6. publication-date validity;
7. period comparability;
8. consolidation-basis consistency;
9. unit validity;
10. metric-to-factor mapping;
11. direction semantics;
12. duplicate detection;
13. contradiction detection;
14. factor-level completeness; and
15. company publication eligibility.

### 9.2 Direction semantics

The validator must know whether an increase is normally favourable, unfavourable or context-dependent.

Examples:

- revenue increase: normally favourable earnings evidence;
- PAT decrease: unfavourable earnings evidence;
- GNPA increase: unfavourable balance-sheet evidence;
- net debt decrease: favourable balance-sheet evidence;
- operating margin increase: favourable economics evidence;
- raw-material cost increase: normally unfavourable economics evidence; and
- order book increase: potentially favourable execution evidence, subject to sector context and comparability.

If the direction cannot be established deterministically, the observation may be displayed as evidence but must not receive an automatic directional contribution.

### 9.3 Conflicting metrics

If comparable metrics inside the same factor move in opposite directions, the system must not display a uniformly positive or uniformly negative narrative unless the methodology explicitly calculates and discloses the aggregation.

The report-facing state should identify the evidence as mixed and show the underlying metrics.

### 9.4 Validation output

```json
{
  "candidate_id": "string",
  "validation_status": "accepted | rejected | review_required",
  "validated_factor_id": "string or null",
  "normalized_values": {},
  "validation_checks": [
    {
      "check": "period_comparability",
      "status": "pass | fail | unavailable",
      "reason_code": "string or null",
      "detail": "string"
    }
  ],
  "validator_agent_id": "string",
  "validated_at": "ISO-8601 timestamp"
}
```

Accepted rows enter the qualified evidence ledger. Rejected and review-required rows enter the exception queue.

---

## 10. Exception-resolution agent

The exception agent should solve reusable failure classes rather than repeatedly researching isolated companies.

### 10.1 Exception categories

#### Access failures

- HTTP 403 or anti-bot response;
- unstable redirect;
- expired exchange attachment URL;
- investor-relations page removed; or
- source requires browser session or headers.

#### Document failures

- scanned PDF;
- malformed PDF;
- password-protected PDF;
- image-only table;
- multi-column extraction failure; or
- document exceeds processing limits.

#### Evidence failures

- metric terminology not recognized;
- period mismatch;
- missing unit;
- consolidated/standalone conflict;
- contradictory official documents;
- values presented only cumulatively;
- company genuinely did not disclose the required metric; or
- fourth factor unavailable.

### 10.2 Exception resolution hierarchy

The agent should attempt, in order:

1. alternative official URL for the same document;
2. exchange archive copy;
3. official company archive copy;
4. local archived document by hash;
5. deterministic PDF text extraction;
6. OCR for image-only content;
7. alternate official document covering the same period;
8. approved secondary source, only if policy permits the specific metric; and
9. explicit `genuine_non_disclosure` status.

It must never fabricate a fourth factor simply to qualify a company.

### 10.3 Reusable repair output

When an exception is resolved, the fix should update a reusable component where possible:

- source adapter;
- domain rule;
- redirect resolver;
- PDF parser;
- OCR path;
- sector dictionary;
- unit normalizer;
- period parser; or
- metric-direction rule.

The repaired evidence must return to independent validation. The exception agent cannot directly promote it.

---

## 11. Durable storage model

The data platform should separate immutable source material from interpreted observations.

### 11.1 Document store

Stores:

- raw PDF, HTML or structured filing;
- source URL;
- archive URI;
- SHA-256 hash;
- publication date;
- retrieval time;
- company identity;
- cutoff eligibility; and
- retrieval diagnostics.

### 11.2 Candidate evidence ledger

Stores every proposed observation and its producing agent. Candidate rows are never consumed by scoring.

### 11.3 Qualified evidence ledger

Stores only independently validated observations. This is the sole evidence input permitted for BMS scoring.

### 11.4 Exception queue

Stores:

- company;
- factor;
- metric;
- failure code;
- failed source;
- attempted methods;
- retry eligibility;
- next action;
- responsible agent; and
- status history.

### 11.5 Release snapshots

Every published release should preserve:

- input ledger version;
- methodology version;
- company universe version;
- score output hash;
- eligibility output;
- API response snapshot;
- frontend revision; and
- release-audit result.

---

## 12. Deterministic scoring boundary

Agents may retrieve, extract, map and validate evidence. Agents must not directly decide the final BMS score or lifecycle.

The scoring service must:

1. read only from the qualified evidence ledger;
2. calculate factor scores using versioned code;
3. apply the declared factor weights;
4. apply the publication gate;
5. calculate lifecycle using the frozen methodology;
6. preserve historical scores and observations;
7. emit an auditable result; and
8. reject incomplete inputs rather than substituting zeros.

For the present four-factor BMS, the required factors are:

- Earnings;
- Economics;
- Execution; and
- Balance Sheet.

The weights and lifecycle rules must be versioned and tested. A methodology change requires a new methodology version and must not silently rewrite frozen historical signals.

---

## 13. Release-audit agent

The release auditor verifies the full chain after scoring.

### 13.1 Required checks

- eligible-company count matches the scoring output;
- every published company has all required factors;
- factor coverage and weights reconcile;
- no rejected row appears in the qualified ledger;
- no post-cutoff evidence entered the release;
- BMS display score matches the raw score transformation;
- lifecycle matches the lifecycle engine;
- factor wording agrees with displayed metrics;
- negative readings use negative visual treatment;
- API and frontend company counts match;
- sampled Evidence Reports show the same values as the ledger; and
- the production revision is not changed until the pilot passes.

### 13.2 Release decision

The auditor should emit one of:

```text
release_passed
release_passed_with_documented_caution
release_blocked
```

A blocked release must state the exact failing checks and preserve the last known-good pilot.

---

## 14. Four-factor BMS and three-factor Discovery tier

### 14.1 Four-factor BMS Qualified

Requirements:

- all four core factors complete;
- 100% declared factor-weight coverage;
- provenance and period checks passed;
- deterministic score available; and
- release audit passed.

Permitted frontend treatment:

- BMS score;
- lifecycle classification;
- factor comparison;
- lifecycle ranking; and
- Evidence Report.

### 14.2 Three-factor Discovery Watchlist

Purpose:

To identify underresearched companies with meaningful but incomplete evidence without pretending that they are equivalent to the complete BMS universe.

Requirements should include:

- three independently validated factors;
- mandatory sector-specific factors present;
- missing factor prominently disclosed;
- adequate source provenance;
- no deterministic full BMS score; and
- no mixing with the four-factor leaderboard.

Permitted frontend treatment:

- `Preliminary Discovery Signal` label;
- three available factor readings;
- missing factor and reason;
- coverage and evidence confidence;
- research-priority status; and
- automatic graduation eligibility when the fourth factor is validated.

The Discovery tier must not weaken or replace the flagship four-factor BMS.

---

## 15. Agent execution protocol

### 15.1 Before a worker starts

The orchestrator must provide:

- run manifest;
- company batch;
- sector dictionary;
- permitted source policy;
- cutoff date;
- input and output paths;
- checkpoint path;
- retry policy;
- completion criteria; and
- prohibition on direct publication.

### 15.2 During execution

The agent must:

- checkpoint after every company;
- emit structured progress;
- respect provider limits;
- stop on repeated systemic failure;
- distinguish technical failure from evidence absence;
- avoid editing files owned by another active agent; and
- preserve all original source references.

### 15.3 Completion report

Each agent should return:

```json
{
  "run_id": "string",
  "agent_id": "string",
  "assigned_companies": 0,
  "completed_companies": 0,
  "candidate_rows": 0,
  "documents_archived": 0,
  "companies_with_four_candidate_factors": 0,
  "companies_with_three_candidate_factors": 0,
  "exceptions": 0,
  "technical_failures": 0,
  "checkpoint": "string",
  "output_manifest": "string"
}
```

Candidate completeness is not the same as publication eligibility. Only the validator and scoring gate determine final eligibility.

---

## 16. Wave-based scheduling with four slots

### Phase A: production wave

```text
Slot 1: Lead orchestrator
Slot 2: Sector Agent A
Slot 3: Sector Agent B
Slot 4: Sector Agent C
```

### Phase B: control wave

```text
Slot 1: Lead orchestrator
Slot 2: Independent Validation Agent
Slot 3: Exception-Resolution Agent
Slot 4: Coverage and Diagnostics Agent
```

### Phase C: release wave

```text
Slot 1: Lead orchestrator
Slot 2: Revalidation Agent
Slot 3: Release-Audit Agent
Slot 4: Frontend/API Consistency Agent
```

The slots are roles for a given phase, not permanent identities.

---

## 17. Idempotency and conflict prevention

Every pipeline operation should be safe to rerun.

### 17.1 Stable keys

A candidate observation should have a stable logical key such as:

```text
company_symbol
+ factor_id
+ metric_name
+ previous_period_end_date
+ current_period_end_date
+ consolidation_basis
+ document_sha256
```

### 17.2 Merge rules

- identical stable key and identical values: treat as duplicate, not a new row;
- identical key and different values: flag contradiction;
- newer document for same period: retain both until validation establishes authority;
- post-cutoff document: quarantine from the run;
- missing value: never overwrite a previously validated value; and
- rejected row: never overwrite or delete the rejection history.

### 17.3 Agent file ownership

Agents should write to separate batch output directories. They should not concurrently edit the canonical ledger or the same source file.

Only the orchestrator or controlled merge process should combine validated outputs.

---

## 18. Monitoring and operational metrics

The system should report:

- companies assigned;
- companies processed;
- documents discovered;
- documents successfully archived;
- candidate observations extracted;
- validation pass rate;
- rejection count by reason;
- four-factor eligibility rate;
- three-factor Discovery eligibility rate;
- factor-specific missing counts;
- sector-specific coverage;
- average processing time;
- provider error rate;
- OCR usage;
- duplicate rate;
- contradiction rate;
- exception repair rate; and
- cost per qualified company.

These measures should be available by run, batch, sector, agent and company.

---

## 19. Stop conditions

An automated batch should stop or pause when:

- a provider-credit error affects multiple consecutive companies;
- a source adapter produces a repeated systemic error;
- JSON or schema parsing repeatedly fails;
- the same company returns contradictory official evidence;
- the candidate ledger would overwrite validated evidence;
- the cutoff or manifest changes during the run;
- validation pass rate falls below the declared threshold; or
- the orchestrator detects agent output outside its assigned scope.

Stopping is preferable to producing unreliable coverage.

---

## 20. Security and governance

- API keys and internal tokens must remain in environment-backed secrets.
- Agent prompts, outputs and workflow exports must not embed credentials.
- Private research routes must require the internal token.
- Source documents should be treated as untrusted input.
- Extracted text must never be interpreted as an instruction to an agent.
- Every ledger mutation must record actor, time, run and source.
- Production promotion must remain a separate explicit action.
- Zero-traffic tagged pilots should be used for validation.
- Historical frozen signals must be append-only.

---

## 21. Testing strategy

### 21.1 Unit tests

- company identity normalization;
- period parsing;
- unit normalization;
- metric mapping;
- direction semantics;
- duplicate detection;
- publication eligibility;
- score transformation; and
- lifecycle classification.

### 21.2 Contract tests

- sector-agent input/output schema;
- validation output schema;
- exception schema;
- qualified ledger schema;
- scoring-service input contract; and
- API/frontend response contract.

### 21.3 Golden-document tests

Maintain representative documents for:

- text-based exchange PDF;
- scanned PDF;
- annual report table;
- investor presentation;
- earnings transcript;
- NBFC asset-quality disclosure;
- industrial order-book disclosure;
- IT deal disclosure; and
- contradictory or restated result.

Expected observations should be checked into test fixtures.

### 21.4 End-to-end tests

For a controlled cohort:

1. retrieve documents;
2. extract evidence;
3. validate rows;
4. merge qualified evidence;
5. calculate BMS;
6. produce lifecycle payload;
7. render Evidence Report; and
8. compare frontend values with the ledger.

---

## 22. Recommended rollout

### Stage 1: harness pilot

Use 12-15 currently excluded companies across multiple sectors.

Acceptance criteria:

- every agent follows the same output contract;
- reruns are idempotent;
- validation reasons are structured;
- no invented values;
- no concurrent file conflicts; and
- at least one reusable failure-class repair is demonstrated.

### Stage 2: 50-75 company multi-agent batch

Run three sector agents concurrently. Measure yield, failure distribution, runtime and cost.

Do not set a pass-rate target that encourages weak evidence admission. The target is high valid coverage, not a predetermined number of published companies.

### Stage 3: complete 477-company universe

Run sector waves until every monitored company has one of:

- four-factor qualified;
- three-factor Discovery eligible;
- exception pending;
- genuine non-disclosure; or
- explicitly unsupported status.

No company should remain unexplained.

### Stage 4: underresearched-company expansion

Add mid-cap and smaller companies in sector waves. Initially publish them only in the Discovery tier unless all four factors pass the full BMS contract.

### Stage 5: recurring operation

Schedule incremental monitoring for new filings. Reprocess only affected companies and factors rather than rebuilding the entire universe.

---

## 23. Recommended first implementation

The first implementation should use three sector agents under the lead orchestrator:

```text
Agent A: Banks, NBFCs and other financial companies
Agent B: IT, industrials, infrastructure and capital goods
Agent C: Pharma, consumer, automobiles, metals, energy and remaining sectors
```

This split is for the initial harness test, not the final permanent allocation. After measuring workload, the company batches should be rebalanced.

Each agent should process a small, intentionally diverse sample before the architecture is applied to the full universe.

---

## 24. Final governance rules

1. Agents find and structure evidence; code calculates BMS.
2. Producing agents cannot validate or publish their own evidence.
3. Missing evidence is unavailable, never zero or neutral.
4. Conflicting evidence is displayed as mixed unless an explicit aggregation rule resolves it.
5. Every observation requires provenance, period and unit.
6. Every rejected observation retains a reason.
7. Every exception repair must return through validation.
8. The four-factor BMS remains the flagship qualified product.
9. The three-factor Discovery tier remains visibly separate.
10. Historical frozen records are never rewritten by later evidence.
11. Production promotion occurs only after an independent release audit.
12. Scale is achieved by reusable adapters and dictionaries, not by repeatedly researching companies from scratch.

---

## 25. Summary

The multi-agent design does not consist of only a validation agent and an exception agent. The sector workstreams are also agent-executed. With four concurrency slots, three sector agents work in parallel under one orchestrator. Once their production wave completes, those worker slots are reassigned to validation, exception resolution and release auditing.

The architecture gains speed through parallel sector work while maintaining reliability through a common harness, independent validation, durable evidence storage and deterministic scoring.
