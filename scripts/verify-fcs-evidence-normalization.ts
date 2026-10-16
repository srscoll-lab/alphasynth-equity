import assert from 'node:assert/strict';
import {normalizeFcsComparisonValues, normalizeFcsUnit, normalizeFcsValues, sourceSupportsFcsUnit} from '../src/fcs-evidence-normalization.ts';

const normalized = normalizeFcsValues('INR lakhs', 215445, 366820, ['INR crore']);
assert.deepEqual(normalized, {
  unit: 'INR crore', previousValue: 2154.45, currentValue: 3668.2,
  sourceUnit: 'INR lakhs', sourcePreviousValue: 215445, sourceCurrentValue: 366820,
  conversion: 'INR_lakh_to_crore',
});
for (const unit of ['INR lakh', 'Rs. lakhs', '₹ lakh']) {
  const value = normalizeFcsValues(unit, -150, 0, ['Rs.Cr']);
  assert.equal(value.previousValue, -1.5);
  assert.equal(value.currentValue, 0);
  assert.equal(value.unit, 'Rs.Cr');
  assert.equal(value.conversion, 'INR_lakh_to_crore');
}
assert.equal(normalizeFcsValues('INR lakh', 100, 200, ['INR lakh', 'INR crore']).conversion, 'none');
for (const unit of ['lakhs', 'USD lakh', 'INR million', 'USD million', '%', 'basis points', 'ratio']) {
  const value = normalizeFcsValues(unit, 100, 200, ['INR crore']);
  assert.equal(value.previousValue, 100);
  assert.equal(value.currentValue, 200);
  assert.equal(value.conversion, 'none');
}
assert.equal(normalizeFcsValues('INR lakh', 100, 200, ['percent']).unit, 'INR lakh');
assert.equal(normalizeFcsValues('INR lakh', NaN, 200, ['INR crore']).conversion, 'none');
const percentage = normalizeFcsValues('%', 22.23, 25.74, ['percent']);
assert.equal(percentage.unit, 'percent');
assert.equal(percentage.currentValue, 25.74);
assert.equal(percentage.conversion, 'none');
assert.equal(normalizeFcsUnit('INR lakh', ['INR crore']), 'INR lakh');
const crossFiling = normalizeFcsComparisonValues('INR (in Actuals)', 'INR Lakhs',
  21544500000, 366820, ['INR crore']);
assert.deepEqual(crossFiling, {
  unit: 'INR crore', previousValue: 2154.45, currentValue: 3668.2,
  previousSourceUnit: 'INR (in Actuals)', currentSourceUnit: 'INR Lakhs',
  previousConversion: 'INR_10000000_to_crore', currentConversion: 'INR_100_to_crore',
});
assert.equal(sourceSupportsFcsUnit('Description of presentation currency INR (in Actuals)',
  'INR (in Actuals)'), true);
assert.equal(sourceSupportsFcsUnit('Description of presentation currency INR Lakhs',
  'INR (in Actuals)'), false);
assert.equal(sourceSupportsFcsUnit('Description of presentation currency INR Lakhs',
  'INR Lakhs'), true);
assert.equal(normalizeFcsComparisonValues('lakhs', 'INR Lakhs', 100, 200, ['INR crore']), null);
assert.equal(normalizeFcsComparisonValues('USD million', 'INR Lakhs', 100, 200, ['INR crore']), null);
assert.equal(normalizeFcsComparisonValues('%', 'percent', 10, 12, ['percent'])?.unit, 'percent');
assert.equal(normalizeFcsComparisonValues('Rs. In Cr', 'Rs. In Cr', 2154, 3668, ['Rs.Cr'])?.unit, 'Rs.Cr');
assert.equal(sourceSupportsFcsUnit('Rs. In Cr', 'Rs. In Cr'), true);
console.log('FCS denomination normalization passed: source values retained; only explicit INR lakh conversion permitted.');
