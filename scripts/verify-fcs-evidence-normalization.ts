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
for (const unit of ['lakhs', 'USD lakh', 'USD million', '%', 'basis points', 'ratio']) {
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
assert.equal(normalizeFcsUnit('INR cr', ['Rs.Cr']), 'Rs.Cr');
assert.equal(normalizeFcsUnit('₹ Cr', ['INR crore']), 'INR crore');
assert.equal(normalizeFcsUnit('INR Mn', ['INR million']), 'INR million');
assert.equal(normalizeFcsUnit('INR Millions', ['INR million']), 'INR million');
for (const unit of ['INR CR', 'INR Cr.', 'INR in Crores', 'Rs Cr', '₹ crore']) {
  assert.equal(normalizeFcsUnit(unit, ['Rs.Cr']), 'Rs.Cr');
}
for (const unit of ['INR MN', 'INR in Millions', 'INR-mn']) {
  assert.equal(normalizeFcsUnit(unit, ['INR million']), 'INR million');
}
assert.equal(sourceSupportsFcsUnit('Amounts in ₹ Cr', '₹ Cr'), true);
assert.equal(sourceSupportsFcsUnit('Sales Mix Trends (INR in Mn)', 'INR Mn'), true);
assert.equal(sourceSupportsFcsUnit('Amounts in INR crore', 'INR Mn'), false);
const splitCurrencyAndScale = normalizeFcsComparisonValues(
  'INR (in Actuals)', 'Lakhs', 924331000, 18904, ['INR crore']);
assert.deepEqual(splitCurrencyAndScale, {
  unit: 'INR crore', previousValue: 92.4331, currentValue: 189.04,
  previousSourceUnit: 'INR (in Actuals)', currentSourceUnit: 'Lakhs',
  previousConversion: 'INR_10000000_to_crore', currentConversion: 'INR_100_to_crore',
});
assert.equal(normalizeFcsComparisonValues('Lakhs', 'Crores', 100, 2, ['INR crore']), null);
assert.equal(sourceSupportsFcsUnit(
  'Description of presentation currency INR Level of rounding used in financial results Lakhs Amount in (Lakhs)',
  'Lakhs'), true);
assert.equal(sourceSupportsFcsUnit('Amount in (Lakhs)', 'Lakhs'), false);
const millionToCrore = normalizeFcsValues('INR Mn', 869, 1998, ['INR crore']);
assert.equal(millionToCrore.unit, 'INR crore');
assert.equal(millionToCrore.previousValue, 86.9);
assert.equal(millionToCrore.currentValue, 199.8);
assert.equal(millionToCrore.conversion, 'INR_million_to_crore');
const billionToCrore = normalizeFcsValues('INR Bn', 2, 3, ['INR crore']);
assert.equal(billionToCrore.previousValue, 200);
assert.equal(billionToCrore.currentValue, 300);
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
assert.equal(normalizeFcsComparisonValues('lakhs', 'INR Lakhs', 100, 200, ['INR crore'])?.unit, 'INR crore');
assert.equal(normalizeFcsComparisonValues('USD million', 'INR Lakhs', 100, 200, ['INR crore']), null);
assert.equal(normalizeFcsComparisonValues('%', 'percent', 10, 12, ['percent'])?.unit, 'percent');
assert.equal(normalizeFcsComparisonValues('Rs. In Cr', 'Rs. In Cr', 2154, 3668, ['Rs.Cr'])?.unit, 'Rs.Cr');
assert.equal(sourceSupportsFcsUnit('Rs. In Cr', 'Rs. In Cr'), true);
assert.equal(normalizeFcsUnit('Cr', ['Rs.Cr']), 'Rs.Cr');
assert.equal(sourceSupportsFcsUnit('QUARTERLY RESULT - EBIDTA (Rs. In Cr)', 'Cr'), true);
assert.equal(sourceSupportsFcsUnit('USD in Cr', 'Cr'), false);
// BEL (29 Oct beta): the order book is printed only in running text, number between currency and scale.
assert.equal(sourceSupportsFcsUnit('The order book position of the company as on 1st July, 2026 stood at Rs. 72,258 Crore.', 'Crore'), true);
assert.equal(sourceSupportsFcsUnit('order book of ₹73,882.5 crores as on 1 April 2026', 'INR crore'), true);
assert.equal(sourceSupportsFcsUnit('order book of USD 72,258 crore', 'Crore'), false, 'another currency is not INR');
assert.equal(sourceSupportsFcsUnit('Rs. 72,258 Lakhs', 'INR crore'), false, 'a different scale is not crore');
console.log('FCS denomination normalization passed: source values retained; explicit INR scale conversions verified.');
