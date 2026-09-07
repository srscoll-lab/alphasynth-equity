// Patch an exported workflow without changing credentials, URL, or activation.
// Usage: node scripts/patch-dossier-workflow.mjs input.json output.json
import fs from 'node:fs';
const [input, output] = process.argv.slice(2);
if (!input || !output || input === output) throw new Error('Use separate input and output paths; retain the original backup.');
const raw = JSON.parse(fs.readFileSync(input, 'utf8'));
const w = Array.isArray(raw) ? raw.find(w => w.id === 'alphasynthDossierV1') : raw;
if (w?.id !== 'alphasynthDossierV1' || w.active) throw new Error('Expected the inactive dossier pilot workflow.');
const research = w.nodes.find(n => n.name === 'Build Official Evidence Dossier');
const respond = w.nodes.find(n => n.name === 'Return Dossier');
if (!research || !respond) throw new Error('Expected nodes missing.');
research.parameters.options = { ...research.parameters.options, timeout: 280000, response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } } };
research.onError = 'continueRegularOutput';
respond.parameters.responseBody = "={{ $json.body ?? { error: 'Dossier backend request failed. Inspect the research node execution.' } }}";
respond.parameters.options = { ...respond.parameters.options, responseCode: '={{ $json.statusCode ?? 502 }}' };
fs.writeFileSync(output, JSON.stringify(raw, null, 2), { flag: 'wx', mode: 0o600 });
console.log('Patched response handling only; URL, credentials, request body and inactive state preserved.');
