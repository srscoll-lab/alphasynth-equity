import assert from "node:assert/strict";
import fs from "node:fs";
const workflow=JSON.parse(fs.readFileSync("n8n/market-conversation-intake-v1.json","utf8"));
const code=workflow.nodes.find(n=>n.name==="Apply Public Source and Privacy Policy").parameters.jsCode;
const run=new Function("$json",code);
const [result]=run({body:{ticker:"TEST",information_cutoff:"2026-09-04",social_affects_bms:false,items:[
  {url:"https://valuepickr.com/t/test/1",published_at:"2026-09-01",text:" Public opinion  "},
  {url:"https://writer.substack.com/p/test",published_at:"2026-09-02",text:"Newsletter view"},
  {url:"https://facebook.com/private/test",published_at:"2026-09-01",text:"Not permitted"},
  {url:"https://valuepickr.com/login",published_at:"2026-09-01",text:"Not public"}
]}});
assert.equal(result.json.items.length,2);
assert.equal(result.json.rejected.length,2);
assert.ok(result.json.items.every(x=>x.author_handle===null));
assert.deepEqual(result.json.rejected.map(x=>x.reason),["unsupported_source","non_public_url"]);
console.log("PASS: market-conversation intake policy");
