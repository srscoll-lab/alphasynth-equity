# On-demand FCS repair — bounded first stage, 7 October 2026

## Scope and budget

User explicitly stopped cohort expansion and prioritized reusable on-demand FCS. Work is divided by pipeline responsibility, not batches of companies. Two bounded helpers completed retrieval implementation and extraction audit/issuer-metadata validation. No ongoing agents, recurring research or cohort batch was started.

Allowance at start: 73% five-hour / 80% weekly remaining. Preserve roughly 30% five-hour headroom for explanation and handoff; stop earlier if the next development stage is too large. Paid Codex balance remained 1302.2979115000 at the 49%-remaining check. Google Cloud builds and Vertex review execution are separate infrastructure costs, not Codex paid credits.

## Established failure

Original INDIGO job `indigo-16acee1f-76ef-4086-8479-9ad157991178`: incomplete, zero qualifying comparisons, nine stored anchors, zero known official sources, thirteen Google grounding references. Reference count is not a count of downloaded PDFs. Old diagnostics could not identify why extraction returned no rows.

## Shared repairs deployed

- Resolve bounded Google discovery redirects, but admit only independently trusted issuer or exchange document hosts.
- Detect PDFs by bytes/content type, including extensionless downloads, and follow one level of PDF links from trusted landing pages.
- Limit documents, requests, bytes, pages and elapsed retrieval time. Retain success and failure diagnostics rather than silently discarding failed downloads.
- Retain original→final source mappings and reuse downloaded bytes for current/prior verification.
- Preserve known publication dates in the extraction input. Unindexed model-supplied dates must be explicit in the document header and later than the reporting-period end. Capture dates are not publication dates.
- Align accounting-basis instructions with the validator's registry, require units, and allow two bounded alternatives per factor.
- Do not consume a duplicate comparison key before source verification succeeds.
- Select one current reporting period in the worker; factors from older periods cannot make a newer period falsely complete.
- Learn issuer-domain hints only from strict matching company/symbol/website metadata in trusted exchange PDF covers; titles or brand-like hostnames alone are not sufficient.
- Explain terminal retrieval, extraction and date-verification failures without exposing private diagnostics or implying company unsuitability. Preserve history diagnostics.

Beta revision: `alphasynth-equity-ondemandfix1007`, expectation-pilot tag, zero main traffic. Private worker: `fcs-review-worker-ondemandfix1007`, 100% worker traffic, existing environment/IAM/queue/storage retained. Brief gateway error occurred during provisioning; both revisions became ready and published-report checks passed afterward.

## Tests

TypeScript check; mocked grounded-retrieval fixtures; issuer-domain spoof/identity fixtures; publication-date fixtures; terminal failure explanations; mixed-quarter worker gate; existing quarterly-history, publication and request/status contracts. Wipro/Tech Mahindra live archive/hash checks passed after deployment. Current library remains 58 four-factor records / 21 lifecycle-ready / 37 pending. Frozen validation and original snapshots were not modified. User PDF template was excluded from staged changes. No GitHub push.

## Controlled live test

Exactly one INDIGO retry was submitted: `indigo-da4b9e1b-48b9-4dd0-aa46-9b59c98cc816`, cutoff 2026-10-07. It finished incomplete with zero admitted factors. Twenty-five source references were supplied; 24 discovery redirects resolved, 24 final domains were rejected, the bounded request limit was reached once, and no readable verified official document was retrieved. References were predominantly broker/news/social pages. Three references resolved to goindigo.in press releases, but no independently verified issuer-domain metadata was available, so these were rejected rather than automatically trusted. Two proposed comparisons then failed previous-document validation. No unsupported score was published.

The live failure is now specifically localized to official-source identification/discovery, not an asserted absence of company financial data and not the scoring formula. Do not resubmit automatically. A deployed repair plus fixture tests is not proof of general on-demand report reliability.

## Remaining acceptance work

Next priority: a separate bounded official-source discovery/issuer-metadata stage, before financial research. Prefer exchange-verified issuer website metadata and current financial-release indexes; do not use brand-like hostnames or citation titles as proof. The initial research instruction also needs to prioritize the latest published quarter over stale stored comparison anchors. The present Google search returned mostly secondary references despite official-only instructions; prompt wording alone is not a reliable source filter.

## Additional bounded source-layer improvement

Implemented `discoverFcsIssuerDomains`: one separate, bounded source-identity search requests exchange cover letters rather than financial facts; downloaded NSE/BSE documents must independently match company name, exact symbol and explicit website metadata before an issuer domain is trusted. The initial financial research now prioritizes the latest published quarter rather than older stored anchors.

The retriever now supports qualifying financial HTML from independently trusted sources. It strips script/navigation material, retains original bytes/hash, extracts only explicit publication metadata (not dateModified or fetch time), and prefers linked PDFs. Verification reuses the cleaned retrieved text; ISO publication timestamps are handled without inventing a date. Mocked identity, HTML, spoofing, metadata and script-only tests plus TypeScript and existing regression tests pass.

Beta deployment of this additional improvement completed as `alphasynth-equity-ondemandmetadata1007`, expectation-pilot tag, zero main traffic. No second live research retry was launched. The private worker's existing dynamic-evidence URL points to the beta tag; no second worker rollout is needed for these source-endpoint-only changes. Deployment completion is not a successful live four-factor acceptance test.

Development stopped at the bounded milestone with 41% five-hour / 75% weekly remaining, preserving more than the intended explanation reserve. Paid Codex balance stayed unchanged. Remaining acceptance areas include live issuer-metadata discovery, actual four-factor completion for INDIGO, inaccessible/image-only documents, table/column extraction, sector metric coverage and consistent latest-quarter selection. No OCR service has been added. Successful requests outside the static library also need an explicit tested publication-to-library admission path; do not assume they automatically enlarge the displayed cohort.

Before promoting universal on-demand generation, demonstrate successful end-to-end reports for previously unscored companies across sectors, including current/prior source archives, exact values and units, four validated factors, correct dates, and lifecycle only with three comparable checkpoints. Preserve successful evidence and retry only missing work in subsequent stages. Do not weaken the scoring formula or substitute invented evidence to improve completion counts.

## Workflow to explain to the user

## Further authorized repair pass

User explicitly released the explanation reserve until tomorrow and authorized continued bounded engineering. Added SEBI-hosted prospectus identity fallback: exact legal-name heading, an explicit valid CIN and one safe Website origin must be present in the actual downloaded cover. It is identity metadata only, never current-quarter financial evidence. The real public IndiGo prospectus was downloaded locally and validated by the production parser: 6,043,468 bytes, SHA-256 `813c6d97aba10b0ed98c84802e9e0abea1cc4c130fa8bbe88251f5c64d5aa29a`, source `https://www.sebi.gov.in/sebi_data/attachdocs/1445319248511.pdf`, domain `goindigo.in`. No company-specific financial parser or score was added.

Beta `alphasynth-equity-ondemandregulator1007` deployed with no main traffic. Controlled job `indigo-5009faa0-0d49-4fb2-8d17-365305185870` remained incomplete, 0/4. NSE access remained HTTP 403; the SEBI-only metadata search returned an investment-bank URL instead of a regulator original, so the validator admitted nothing. This identifies a further provider-discovery limitation, not a successful end-to-end repair.

Added `metadataSourceCandidates` to extract bounded literal official URLs from model response text in addition to grounding citations. SEBI PDF-viewer wrappers are normalized only for explicit attachdocs paths on the exact regulator host. These remain untrusted discovery hints and must pass downloaded-cover identity checks. Mock tests cover exact hosts, credential/port/spoof rejection, deduplication and wrapper normalization. Regulator fallback also reuses earlier discovery references instead of discarding potentially useful regulator sources.

Added a no-readable-original guard for previously unscored issuers with no known official sources: skip structured model extraction and return clear retrieval diagnostics rather than incur a model call on search prose. Aligned browser status/report timeouts to 35 seconds, leaving room for the server's 30-second private-worker allowance. Activity persistence, duplicate-poll suppression and terminal-result tests pass. TypeScript and source validators pass. Deployment of this combined update completed as `alphasynth-equity-ondemandsources1007`, beta tag only.

Controlled test `indigo-dbc400bf-b1d7-4446-949e-6d4a9c004a9e` finished incomplete, 0/4. NSE metadata retrieval returned 403. The regulator fallback supplied ten references, but Google discovery redirects failed or stalled before any regulator original was admitted; it exhausted the 25-second retrieval budget. These failures occurred on Google redirect URLs, so they do NOT establish that a direct SEBI PDF download from Cloud Run is blocked. The source summary reported zero admitted official documents and the new no-evidence guard skipped structured extraction, as intended. Public status subsequently returned the finished terminal record correctly.

Added per-request retrieval bounds (4 seconds for Google discovery, 12 seconds for official downloads), preserving the overall deadline and byte limits. A mocked stalled-redirect fixture verifies that a later readable official PDF is still processed. Added sanitized transport-cause codes for private diagnosis. This retrieval-only update completed as `alphasynth-equity-ondemandbounded1007`; no further live research retry was launched after it, so the new timeout bounds are fixture-tested but not end-to-end acceptance-tested. Public status smoke passed on that revision and main traffic was independently confirmed unchanged at dossier17. Direct source-access testing and dependable identity-source lookup remain necessary before declaring universal on-demand ready. Existing live WIPRO/TECHM archive and score checks passed, with 58/21/37 coverage and frozen validation unchanged. At the final usage check, 19% five-hour and 72% weekly allowance remained, paid Codex balance unchanged. No GitHub push or main-app traffic change.

## Resumed controlled acceptance test

With user authorization, one additional INDIGO test of `ondemandmetadata1007` was run: `indigo-01ce98a5-2bee-464e-ba40-699baa779092`. It finished incomplete, 0/4, with no report. The metadata stage found two references, including an actual NSE archive filing; downloading that filing returned HTTP 403. The other reference was a SEBI document, outside this exchange-cover validator's admitted source set. No issuer domain was independently established. Financial research supplied six secondary references, all rejected; no readable verified original was retrieved. This proves metadata discovery can locate an exchange reference but does not yet solve production exchange access. Do not relax identity checks or invent company eligibility to improve counts.

The first public status lookup failed with a logged 10-second timeout; a subsequent read returned the completed terminal record correctly. Local status/result gateway timeouts were increased to 30 seconds to accommodate private-worker startup without resubmitting jobs. This timeout change is not yet deployed. Its cause is consistent with worker startup latency, not conclusively proven by the log alone.

Next engineering priority is a dependable independently verified issuer-source registry/access path with provenance and permitted retrieval, avoiding reliance on a single blocked exchange download. Then test actual document extraction. Do not run more research retries until that path is repaired. No new cohort records were published. At the resumed run's usage checks, five-hour remaining went from 37% to 35%; weekly remaining stayed 75%, and paid Codex balance stayed unchanged. Work pauses before the larger source-access repair to preserve explanation headroom.

Request a company → check cached qualified report → if new work is needed, record one durable job → establish official issuer identity and document sources → retrieve PDF/HTML originals → extract dated, like-for-like factor comparisons → validate all four factors for one current period → deterministic FCS calculation → publish current report → retrieve two earlier comparable quarterly checkpoints → publish dated lifecycle only if all three checkpoints qualify. Global review status remains available while the user explores other pages. An incomplete terminal job is explicitly finished, does not provide a fabricated score, and does not imply company ineligibility. This describes the intended end-to-end contract, not a claim that all acceptance tests are complete.
