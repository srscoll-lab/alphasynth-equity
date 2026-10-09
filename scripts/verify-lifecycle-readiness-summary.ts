import signalTracker from "../src/data/signalTrackerV2Comparison.json";
import { fundamentalChangeLibrary } from "../src/data/fundamentalChangeLibrary.ts";
import { mergeFcsPublications } from "../src/fcs-publications.ts";
const base="https://expectation-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app";
const payload:any=await(await fetch(`${base}/api/bms/fundamental-review/publications`,{signal:AbortSignal.timeout(30_000)})).json();
const library=mergeFcsPublications(fundamentalChangeLibrary,payload.publications);
const cohort=new Set(signalTracker.companies.map(company=>company.symbol));
const controlled=library.filter(record=>cohort.has(record.symbol));
console.log(JSON.stringify({controlled_cohort:cohort.size,controlled_records:controlled.length,
  controlled_lifecycle_ready:controlled.filter(record=>record.lifecycleReady).length,
  controlled_pending:controlled.filter(record=>!record.lifecycleReady).length,
  full_library:library.length,full_library_ready:library.filter(record=>record.lifecycleReady).length,
  full_library_pending:library.filter(record=>!record.lifecycleReady).length}));
