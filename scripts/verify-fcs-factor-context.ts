import assert from 'node:assert/strict';
import { selectFcsFactorContext } from '../src/fcs-factor-context.ts';

const header = 'Official filing 2026-08-10. INR currency rounded to lakhs. Quarter end 30-06-2026.\n';
const unrelated = 'Unrelated corporate narrative. '.repeat(900);
const text = `${header}${unrelated}Revenue from operations 3,66,820.00 for 30-06-2026.\n`
  + `${unrelated}Debt equity ratio 0.2600 for 30-06-2026.\n${unrelated}`;
const source = { sourceUrl: 'https://nsearchives.nseindia.com/corporate/ixbrl/example.html', sourceDate: '2026-08-10', text };
const earnings = selectFcsFactorContext([source], 'earnings')[0];
const balance = selectFcsFactorContext([source], 'balance_sheet')[0];
assert(earnings.text.includes('3,66,820.00'), 'earnings must retain a matching middle passage');
assert(balance.text.includes('Debt equity ratio 0.2600'), 'balance sheet must retain its matching passage');
assert(earnings.text.includes('Official filing 2026-08-10'), 'retain header provenance');
assert(earnings.text.length <= 12000 && balance.text.length <= 12000, 'bounded model input');
assert.equal(earnings.sourceUrl, source.sourceUrl);
assert.equal(earnings.sourceDate, source.sourceDate);
const short = { ...source, text: 'Short complete filing text.' };
assert.equal(selectFcsFactorContext([short], 'economics')[0].text, short.text);
const unfamiliar = selectFcsFactorContext([{ ...source, text: `${header}${'X'.repeat(12000)}last table` }], 'execution')[0];
assert(unfamiliar.text.includes('last table'), 'unknown labels retain the filing tail');
console.log('FCS factor context: bounded per-factor middle passages and provenance passed.');
