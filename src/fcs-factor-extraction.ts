/** Bound Gemini 2.5 reasoning so the output cap leaves room for structured rows.
 * Unknown model families retain their existing defaults; budgets are model-specific.
 * https://cloud.google.com/vertex-ai/generative-ai/docs/thinking
 */
export function fcsExtractionGenerationConfig(model: string, attempt = 0) {
  return {
    maxOutputTokens: attempt === 0 ? 6144 : 8192,
    ...(/(?:^|\/)gemini-2\.5-(?:flash(?:-lite)?|pro)(?:$|-)/i.test(model)
      ? { thinkingConfig: { thinkingBudget: attempt === 0 ? 2048 : 1024, includeThoughts: false } }
      : {}),
  };
}

function safeUsageDiagnostic(value: Record<string, unknown>) {
  const usage = value.usageMetadata && typeof value.usageMetadata === 'object'
    ? value.usageMetadata as Record<string, unknown> : {};
  return Object.fromEntries([
    ['promptTokenCount', 'prompt_token_count'],
    ['candidatesTokenCount', 'output_token_count'],
    ['thoughtsTokenCount', 'thoughts_token_count'],
    ['totalTokenCount', 'total_token_count'],
  ].flatMap(([key, label]) => typeof usage[key] === 'number' && Number.isSafeInteger(usage[key]) && Number(usage[key]) >= 0
    ? [[label, usage[key]]] : []));
}

function safeFailureDiagnostic(factor: string, error: unknown) {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const response = value.response && typeof value.response === 'object'
    ? value.response as Record<string, unknown>
    : {};
  const status = Number(value.status ?? response.status);
  const partTypes = Array.isArray(value.responsePartTypes)
    ? value.responsePartTypes.map(String).filter(item => /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(item)).slice(0, 8)
    : [];
  const code = String(value.code ?? '').trim();
  const finishReason = String(value.finishReason ?? '').trim();
  const responseTextLength = Number(value.responseTextLength);
  return {
    ...safeUsageDiagnostic(value),
    outcome: 'factor_extraction_failed',
    factor,
    error_type: String(value.name || 'Error').slice(0, 80),
    ...(code && /^[A-Z0-9_.-]{1,80}$/i.test(code) ? { error_code: code } : {}),
    ...(Number.isInteger(status) && status >= 400 && status <= 599 ? { http_status: status } : {}),
    ...(finishReason && /^[A-Z0-9_.-]{1,80}$/i.test(finishReason) ? { finish_reason: finishReason } : {}),
    ...(partTypes.length ? { response_part_types: partTypes } : {}),
    ...(Number.isInteger(responseTextLength) && responseTextLength >= 0 ? { response_text_length: responseTextLength } : {}),
    ...(typeof value.jsonBoundaryComplete === 'boolean' ? { json_boundary_complete: value.jsonBoundaryComplete } : {}),
  };
}

function parseStructuredRows(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(trimmed); }
  catch (firstError) {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try { return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)); }
      catch { /* Re-throw a safe, enriched parse failure below. */ }
    }
    const error: any = new SyntaxError('The model response was not valid structured JSON.');
    error.code = 'MODEL_JSON_INVALID';
    error.responseTextLength = text.length;
    error.jsonBoundaryComplete = firstBrace >= 0 && lastBrace > firstBrace;
    error.cause = firstError;
    throw error;
  }
}

export type FactorResponse = string | { text: string; finishReason?: string; usageMetadata?: {
  promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; totalTokenCount?: number;
} };
/** Sequential, at most two calls per factor; retry only malformed structured output. */
export async function extractFcsFactors(factors:readonly string[],run:(factor:string, attempt:number)=>Promise<FactorResponse>){
  const allowed=['earnings','economics','execution','balance_sheet'];
  const requested=[...new Set(factors)].filter(f=>allowed.includes(f));
  const rows:any[]=[];const diagnostics:any[]=[];
  for(const factor of requested){
   for(let attempt=0;attempt<2;attempt++){
    let response: FactorResponse | undefined;
    try{
      response=await run(factor,attempt);
      const text=typeof response==='string'?response:response.text;
      if (typeof response !== 'string' && response.finishReason === 'MAX_TOKENS') {
        const error: any = new Error('Structured extraction reached its output limit.');
        error.code = 'MODEL_OUTPUT_TRUNCATED';
        error.responseTextLength = text.length;
        throw error;
      }
      const parsed=parseStructuredRows(text);
      if(!parsed || !Array.isArray(parsed.rows)) {
        const error:any=new Error('Expected a rows array.');error.code='MODEL_SCHEMA_INVALID';throw error;
      }
      const candidates=parsed.rows.filter((r:any)=>r && typeof r==='object' && r.factor===factor).slice(0,2);
      rows.push(...candidates);diagnostics.push({outcome:'factor_extraction_completed',factor,candidate_count:candidates.length,
        ...(typeof response !== 'string' ? safeUsageDiagnostic(response) : {})});
      break;
    }catch(error){
      if(error && typeof error==='object' && response && typeof response!=='string') Object.assign(error,{finishReason:response.finishReason,usageMetadata:response.usageMetadata});
      const diagnostic=safeFailureDiagnostic(factor,error);
      const retry=attempt===0 && (['MODEL_JSON_INVALID','MODEL_SCHEMA_INVALID','MODEL_OUTPUT_TRUNCATED'].includes(diagnostic.error_code??'')
        || (diagnostic.error_code==='MODEL_TEXT_EMPTY' && diagnostic.finish_reason==='MAX_TOKENS'));
      diagnostics.push({...diagnostic,attempt:attempt+1,retry_scheduled:retry});
      if(!retry) break;
    }
   }
  }
  rows.sort((a,b)=>allowed.indexOf(a.factor)-allowed.indexOf(b.factor));
  return {rows,diagnostics};
}
