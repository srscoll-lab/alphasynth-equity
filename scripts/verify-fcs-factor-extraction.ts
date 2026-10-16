import assert from 'node:assert/strict';
import {extractFcsFactors,fcsExtractionGenerationConfig} from '../src/fcs-factor-extraction.ts';
import {normalizeFcsUnit,normalizeFcsPeriodLabel} from '../src/fcs-evidence-normalization.ts';
let calls=0,active=0,peak=0;
const result=await extractFcsFactors(['earnings','economics','execution','balance_sheet','earnings','other'],async factor=>{
 calls++;active++;peak=Math.max(peak,active);await Promise.resolve();active--;
 if(factor==='economics'){
  const error:any=Error('provider secret');
  error.code='RESOURCE_EXHAUSTED';error.status=429;error.finishReason='MAX_TOKENS';error.responsePartTypes=['executableCode'];
  throw error;
 }
 return JSON.stringify({rows:[{factor},{factor:'other'}]});
});
assert.equal(calls,4);assert.equal(peak,1);assert.equal(result.rows.length,3);
assert.equal(result.diagnostics.filter(d=>d.outcome==='factor_extraction_failed').length,1);
const failure:any=result.diagnostics.find(d=>d.outcome==='factor_extraction_failed');
assert.equal(failure.error_code,'RESOURCE_EXHAUSTED');assert.equal(failure.http_status,429);
assert.equal(failure.finish_reason,'MAX_TOKENS');assert.deepEqual(failure.response_part_types,['executableCode']);
assert(!JSON.stringify(result).includes('secret'));
const wrapped=await extractFcsFactors(['earnings'],async()=>`Result follows:\n\`\`\`JSON\n{"rows":[{"factor":"earnings"}]}\n\`\`\``);
assert.equal(wrapped.rows.length,1);
let attempts=0;
const recovered=await extractFcsFactors(['execution'],async(_factor,attempt)=>{
 attempts++;
 return attempt===0?{text:'{"rows":[',finishReason:'MAX_TOKENS'}:{text:'{"rows":[{"factor":"execution"}]}',finishReason:'STOP'};
});
assert.equal(attempts,2);assert.equal(recovered.rows.length,1);
assert.equal(recovered.diagnostics[0].finish_reason,'MAX_TOKENS');
assert.equal(recovered.diagnostics[0].error_code,'MODEL_OUTPUT_TRUNCATED');
let truncatedCalls=0;
const truncated=await extractFcsFactors(['earnings'],async()=>{
 truncatedCalls++;
 return {text:'{"rows":[{"factor":"earnings"}]}',finishReason:'MAX_TOKENS',
  usageMetadata:{thoughtsTokenCount:6000,candidatesTokenCount:144,totalTokenCount:6144}};
});
assert.equal(truncatedCalls,2);assert.equal(truncated.rows.length,0);
assert.equal(truncated.diagnostics[0].thoughts_token_count,6000);
assert.equal(truncated.diagnostics[0].output_token_count,144);
const emptyRecovered=await extractFcsFactors(['economics'],async(_factor,attempt)=>{
 if(attempt===0){const error:any=new Error('empty');error.code='MODEL_TEXT_EMPTY';error.finishReason='MAX_TOKENS';throw error;}
 return {text:'{"rows":[]}',finishReason:'STOP',usageMetadata:{thoughtsTokenCount:1024}};
});
assert.equal(emptyRecovered.diagnostics.length,2);
assert.equal(emptyRecovered.diagnostics[1].thoughts_token_count,1024);
assert.equal(fcsExtractionGenerationConfig('gemini-2.5-flash').thinkingConfig?.thinkingBudget,2048);
assert.equal(fcsExtractionGenerationConfig('publishers/google/models/gemini-2.5-pro',1).thinkingConfig?.thinkingBudget,1024);
assert.equal(fcsExtractionGenerationConfig('gemini-2.5-flash-lite').thinkingConfig?.thinkingBudget,2048);
assert.equal(fcsExtractionGenerationConfig('gemini-3-flash-preview').thinkingConfig,undefined);
assert.equal(fcsExtractionGenerationConfig('gemini-2.5-flash',1).maxOutputTokens,8192);
const exhausted=await extractFcsFactors(['earnings'],async()=>'{');
assert.equal(exhausted.rows.length,0);assert.equal(exhausted.diagnostics.length,2);
assert.equal(normalizeFcsUnit('%',['percent','basis points']),'percent');
assert.equal(normalizeFcsUnit('Rs.Cr',['INR crore']),'INR crore');
assert.equal(normalizeFcsUnit('USD million',['INR crore']),'USD million');
assert.equal(normalizeFcsUnit('basis points',['percent']),'basis points');
assert.equal(normalizeFcsUnit('INR million',['INR crore']),'INR million');
assert.equal(normalizeFcsPeriodLabel('Quarter ended','2026-06-30'),'Quarter ended 2026-06-30');
assert.equal(normalizeFcsPeriodLabel('FY2025','2026-06-30'),'FY2025');
assert.equal(normalizeFcsPeriodLabel('As on',null),'As on');
console.log('Factor extraction: bounded sequential calls, independent failures, wrong-factor rejection passed.');
