import {FirestoreFundamentalReviewStore} from '../src/fundamental-review-store.ts';
import {fcsPublicationSummaries} from '../src/fcs-publications.ts';
const token=process.env.FCS_READONLY_LEDGER_TOKEN;
if(!token)throw Error('Read-only authentication unavailable');
try {
 const records=await new FirestoreFundamentalReviewStore({projectId:'my-nse-research-app',tokenProvider:async()=>token}).listLatest();
 console.log(JSON.stringify({decoded_records:records.length,publications:fcsPublicationSummaries(records,'2026-10-07')}));
} catch(error) {console.log(JSON.stringify({outcome:'publication_decode_failed',reason:error instanceof Error?error.message:'Unavailable'}));process.exitCode=1;}
