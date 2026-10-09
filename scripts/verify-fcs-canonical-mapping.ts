import assert from 'node:assert/strict';
import registry from '../data/fundamental-review-metric-taxonomy-v2.json' with {type:'json'};
import {mapBmsFactorMetric} from '../src/bms-factor-evidence.ts';
for(const [metric,definition]of Object.entries(registry.metrics))assert.deepEqual(mapBmsFactorMetric(metric),{metric,factor:definition.factor_id});
assert.equal(mapBmsFactorMetric('pat_margin')?.factor,'economics');
assert.equal(mapBmsFactorMetric('pat')?.factor,'earnings');
assert.equal(mapBmsFactorMetric('unknown_unregistered_word'),null);
console.log('All controlled metrics preserve their exact canonical ID and factor.');
