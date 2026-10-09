import assert from 'node:assert/strict';
import {extractFcsFactors} from '../src/fcs-factor-extraction.ts';
let calls=0,active=0,peak=0;
const result=await extractFcsFactors(['earnings','economics','execution','balance_sheet','earnings','other'],async factor=>{
 calls++;active++;peak=Math.max(peak,active);await Promise.resolve();active--;
 if(factor==='economics')throw Error('provider secret');
 return JSON.stringify({rows:[{factor},{factor:'other'}]});
});
assert.equal(calls,4);assert(peak<=2);assert.equal(result.rows.length,3);
assert.equal(result.diagnostics.filter(d=>d.outcome==='factor_extraction_failed').length,1);
assert(!JSON.stringify(result).includes('secret'));
console.log('Factor extraction: bounded calls/concurrency, independent failures, wrong-factor rejection passed.');
