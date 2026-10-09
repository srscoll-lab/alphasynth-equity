# On-demand FCS repair — 8 October 2026

User resumed with 99% five-hour / 71% weekly allowance verified. Cohort expansion remains paused; only pipeline engineering and bounded acceptance tests are in scope. No scoring-formula changes, invented factors or frozen forward-validation changes.

## Independent download diagnostic

Added a protected `/internal/fundamental-review/source-identity` endpoint. It accepts only direct HTTPS PDFs on exact NSE/BSE/SEBI hosts, checks issuer cover identity, and returns hashes/diagnostics. It makes no model calls or FCS job writes. Fixture tests reject spoofed hosts, ports, credentials, wrong issuers and Google discovery links. Beta `alphasynth-equity-identityprobe1008` deployed with zero main traffic.

The direct known SEBI original (`1445319248511.pdf`) timed out from Cloud Run under the current 12-second per-request bound. This is a download issue independent of AI search; it does not establish that the server is permanently blocked. The same original was downloaded locally and validated again successfully.

## Reusable verified-source catalogue

Added `capture-fcs-issuer-identity.ts`, `cachedIssuerIdentity` and support for regulator/exchange originals in the existing private URL/SHA-bound cache. Capture admits a document only after actual cover validation; a URL/hash conflict fails closed. Runtime lookup matches exact symbol/legal name, rereads the original, hash-checks it and reruns cover validation. A stored domain assertion alone is not trusted.

For the acceptance issuer INDIGO, the source is the actual SEBI prospectus, SHA-256 `813c6d97aba10b0ed98c84802e9e0abea1cc4c130fa8bbe88251f5c64d5aa29a`; it validates `goindigo.in`. This is source-identity bootstrapping only, not a company-specific financial parser or hand-entered FCS. The catalogue currently contains this one new reviewed identity; it does not establish automatic identity coverage of the whole NSE universe. Current financial evidence still has to be retrieved and independently validated.

## Published-report display

The previous merge updated known library rows but ignored a newly published unknown symbol. Added explicit, tested opt-in library admission for qualified publication summaries, without changing the default merge or frozen datasets. New on-demand rows obtain market context if present; absent momentum remains unavailable, never zero. New reports open their actual published detail view, not a missing static detail. Original static snapshots retain their original row values even when a newer report exists. New-report lookup/loading states no longer claim an earlier snapshot exists.

TypeScript, cached-identity, direct-identity and publication-list fixtures pass. Combined beta deployment completed as `alphasynth-equity-sourcecatalog1008`. Live cached-original identity verification passed: exact SEBI URL/hash and `goindigo.in` were revalidated from Cloud Run. Normal request `indigo-481809db-a88f-4244-8cf5-fb14e2f4d942`, cutoff 2026-10-08, still finished incomplete, 0/4. It used the identity catalogue but its five financial discovery references yielded no readable original. No GitHub push; source originals remain private deployment assets.

## Financial-source and report-link repair

Extended literal-URL discovery to independently trusted issuer domains, keeping exact-host/subdomain checks, rejecting spoofed hosts and retaining known indexed publication dates. The research prompt explicitly asks for literal source URLs. Updated new-report loading/error states, report company-name headings, live library counts/search availability and the radar's direct published-report link. Original static score detail views retain the original record rather than showing a new score above old factor details. Qualified publication summaries require completedFactors=4; no partial job enters the library. New on-demand report rendering/deduplication and null-momentum fixtures pass.

Beta `alphasynth-equity-financialhints1008` deployed. Controlled job `indigo-1a3090e3-47d5-40f7-bc1b-7ec5fab41b4e` remained incomplete, 0/4. Eight financial-source hints still yielded no admitted document. The no-original guard skipped structured extraction rather than turn search prose into a score.

## Direct issuer-site traversal

Added bounded `discoverIssuerIndexLinks`: verified issuer hosts only, eight requests / 25 seconds, per-request time and streamed size bounds; investor/results/sitemap links are hints only, with no invented values or dates. Off-site links and redirects are rejected. The protected source diagnostic can optionally scan these links with no AI or job writes. Fixture tests and TypeScript pass. Beta `alphasynth-equity-issuerindex1008` deployed.

The live source-only scan revalidated the cached identity but returned no financial candidates. The verified `www.goindigo.in` homepage returned HTTP 403 from Cloud Run. Thus at least this issuer's ordinary cloud access is rejected; this does not prove all PDF asset paths or all issuers are blocked. Do not retry more full research jobs until a usable document path/provider is established. Universal on-demand FCS is still NOT accepted or marketing-ready. At the latest check, 75% five-hour / 67% weekly allowance remained and paid Codex balance was unchanged. New library admission is fixture-tested but has not yet been accepted against a newly qualified live company, since no new score was published.

Final read-only Wipro/Tech Mahindra report replay passed on the deployed beta, including all thirteen original archive hashes. Coverage remains 58 FCS / 21 lifecycle-ready / 37 pending. Traffic inspection confirmed the beta tag targets `issuerindex1008`, while main traffic remains 100% `dossier17` and research tags are unchanged. No running review was left behind and no further AI retries were submitted after the source scan. No Firecrawl search or scrape call was made in this pass: the explicit capped-search permission question remains unanswered. Next step is that approved source-discovery test, not another blind full FCS retry. A successful source search alone will not count as completion; the actual current/prior originals, four factors, deterministic score and published display must all pass acceptance.

## Provider budget

Existing Firecrawl configuration was confirmed without exposing credentials. User was asked separately for permission to run up to two search-only calls (about four provider credits), with no subscription purchase, scraping or recurring calls. Do not perform these calls without the reply. Google Cloud and provider runtime costs are separate from Codex paid-credit balance.

## Authorized Firecrawl discovery test

User subsequently authorized Firecrawl data gathering and reuse for on-demand requests if IndiGo works. One search-only call found the actual issuer investor index with direct Q1 FY27 and Q1 FY26 presentation URLs. Both originals downloaded and parsed through the existing retriever locally. Q1 FY27: 877447 bytes, SHA-256 `988ea976fccede820395ccaf5ae14e98980119a63eb428633038216050055699`, explicit publication July 23, 2026; Q1 FY26: 490367 bytes, SHA-256 `2cda3cec57ad22a8300baf34ee96e3b91515ef6f5ad0733e34bf763fed4dcf24`, explicit publication July 30, 2025. Search-only output is used as URL hints, never score-bearing prose.

Added `fcs-firecrawl-discovery.ts`: one bounded eight-result search, verified-host filtering, up to 24 deduplicated candidates, newest PDF priority, six-hour bounded in-process discovery cache, sanitized failure fallback. No paid scrape/parse options. It scans links late in investor-index results instead of truncating before recent periods. Host spoofing/credentials/ports, late links, ordering, caching and safe failure tests pass; TypeScript passes. Deployed beta revision `alphasynth-equity-firecrawl1008a` with no main traffic. Normal private-worker acceptance job `indigo-37216be6-846b-4ca7-b3a7-3ddf3d3ba1c8` was queued, awaiting results at this note.

That job completed incomplete 0/4: discovery returned 24 official candidates, but direct cloud downloads of the actual PDF asset URLs returned HTTP 403. Local download success did not imply Cloud Run success. A subsequent Firecrawl `rawBase64`, `parsers:[]` request returned the exact Q1 FY27 original (877447 bytes, same `988ea9...` SHA), metadata status 200, basic transport, creditsUsed=1. This establishes original-byte acquisition, not yet FCS success.

Added `createFirecrawlDocumentFetch`, a bounded fallback after failed direct official PDF fetches. It accepts only verified issuer/exchange/regulator hosts, unchanged final URLs, HTTP200, size-bounded PDF-signature bytes. No markdown evidence or paid parsing. Maximum four calls per evidence operation, request-local reuse, sanitized diagnostics. Source discovery prioritizes requested fiscal quarters for historical jobs. New tests verify byte preservation, call limits, caching, changed-source and HTML rejection; existing retrieval/publication-date/mixed-quarter tests and TypeScript pass. Beta revision `firecrawl1008b` deployment started. At this point usage was 16% five-hour /58% weekly remaining, paid Codex balance unchanged: finish the bounded acceptance check then pause before exhaustion.

Potential next issue, not yet changed: the registry has general capacity utilization but no explicit airline load-factor or RPK metric. Do not relabel EBITDAR as EBITDA or cash as net cash. If extraction cannot map an airline operating measure faithfully, report the actual rejection and make a separately documented controlled metric addition rather than manufacture completeness. No scoring policy or metric registry changes were made in this pass.

### Live acceptance result for original-byte fallback

Beta `alphasynth-equity-firecrawl1008b` deployed successfully, zero main traffic. Job `indigo-a585201f-7246-464b-a4fa-74c5815ed819` terminated **incomplete 0/4**, no report. Crucial improvement: the cloud worker acquired and extracted FOUR actual issuer PDFs through Firecrawl rawBase64/basic, 1 reported provider credit each: Q1 FY27 presentation (877447 bytes), Q1 FY27 financial results (562422), Q4 FY26 presentation (783626), Q4 FY26 financial results (639941). Total extracted text 116574 characters. The original-download problem is solved for this case; complete FCS is NOT solved.

The only reported numeric-candidate rejection was `revenue` from Q1 FY27 financial results: `source_values_not_verified`. No other admitted factor rows were reported. Current diagnostics omit the candidate values/period/unit/label, so the next bounded change should preserve a safe structured rejection snapshot or replay the exact extraction response to identify the mismatch. Do not assume the registry alone explains all 0/4; inspect actual extraction first. Presentation text has explicit revenue (245841 vs204963 INR million), PAT margin (-1.0% vs10.6%), load factor (83.3% vs84.6%), and total debt (815313 vs684884 INR million); these are diagnostic observations, NOT approved input rows. Financial statements may use different printed units; never mix units or periods. No company-specific scored values were hard-coded.

New files: `src/fcs-firecrawl-discovery.ts`, `src/fcs-firecrawl-document-fetch.ts`, corresponding `scripts/verify-fcs-firecrawl-*.ts`, and bounded credential-safe `scripts/pilot-fcs-firecrawl-search.ps1`. Source discovery and fallback are generic within the live research endpoint. No subscription purchase, no paid PDF parsing, no GitHub push, no new cohort/backfill or model/score-policy change. The acceptance job is terminal, so no review remains running from this pass.
