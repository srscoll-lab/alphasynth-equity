import fs from 'node:fs';
import path from 'node:path';
import metricRegistry from '../data/fundamental-review-metric-taxonomy-v2.json' with {type:'json'};
import {normalizeFcsComparisonValues} from '../src/fcs-evidence-normalization.ts';

const directory = process.argv[2];
if (!directory || !fs.existsSync(directory)) {
  throw new Error('Usage: node --import tsx scripts/audit-fcs-unit-equivalence-recovery.ts <staging-output-directory>');
}

const metrics = metricRegistry.metrics as Record<string, {allowed_units: string[]}>;
const rows: Array<Record<string, unknown>> = [];
for (const name of fs.readdirSync(directory).filter(item => item.endsWith('.json') && !item.endsWith('-provider.json'))) {
  const payload = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8').replace(/^\uFEFF/, ''));
  for (const diagnostic of payload.diagnostics ?? []) {
    if (!['unregistered_metric_unit', 'incompatible_or_unregistered_source_units'].includes(diagnostic.outcome)) continue;
    const metric = String(diagnostic.metric ?? '');
    const candidate = diagnostic.candidate ?? {};
    const allowed = metrics[metric]?.allowed_units ?? [];
    const normalized = normalizeFcsComparisonValues(
      candidate.original_previous_unit ?? candidate.original_unit ?? candidate.unit,
      candidate.original_unit ?? candidate.unit,
      Number(candidate.previous_value), Number(candidate.current_value), allowed,
    );
    rows.push({
      symbol: payload.ticker,
      metric,
      printedUnit: candidate.original_unit ?? candidate.unit,
      recoveredUnit: normalized?.unit ?? null,
      recoverable: Boolean(normalized && allowed.includes(normalized.unit)),
      previousValue: normalized?.previousValue ?? null,
      currentValue: normalized?.currentValue ?? null,
    });
  }
}

console.table(rows);
const recovered = rows.filter(row => row.recoverable).length;
console.log(JSON.stringify({observedUnitRejections: rows.length, recovered, stillBlocked: rows.length - recovered}));
