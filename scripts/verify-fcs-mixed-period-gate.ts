import assert from 'node:assert/strict';
import {FundamentalReviewService} from '../src/fundamental-review-service.ts';
import {InMemoryFundamentalReviewStore} from '../src/fundamental-review-store.ts';
import {InMemoryFundamentalReviewQueue} from '../src/fundamental-review-queue.ts';
const candidates=['earnings','economics','execution','balance_sheet'].map((factor,i)=>({candidate_id:factor,factor_id:factor,current_period:{end_date:i===0?'2026-06-30':'2026-03-31'}}));
let scored=false;
const service=new FundamentalReviewService({store:new InMemoryFundamentalReviewStore(),queue:new InMemoryFundamentalReviewQueue(),evidenceUrl:'https://test/evidence',scoringUrl:'https://test/score',fetch:async(url)=>{
 if(String(url).endsWith('/score')){scored=true;throw Error('Mixed quarters must not reach scorer');}
 return Response.json({candidates,validations:candidates.map(c=>({candidate_id:c.candidate_id,status:'qualified'})),documents:[],diagnostics:[]});
}});
const job=await service.request({symbol:'TEST',companyName:'Fixture Company',informationCutoff:'2026-10-07'});
const result=await service.execute({symbol:'TEST',jobId:job.jobId!});
assert.equal(result.status,'incomplete');assert.equal(result.completedFactors,1);assert.equal(scored,false);
assert.ok(result.diagnostics.some((d:any)=>d.outcome==='mixed_current_periods_not_combined'));
console.log('Mixed-quarter gate: latest quarter selected; older factors cannot create false four-factor completeness.');
