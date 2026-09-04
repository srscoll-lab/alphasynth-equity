import assert from "node:assert/strict";
import fs from "node:fs";
const workflow=JSON.parse(fs.readFileSync("n8n/market-conversation-aggregation-v1.json","utf8"));
const code=(name)=>workflow.nodes.find((node)=>node.name===name).parameters.jsCode;
const validate=new Function("$json",code("Validate and Deduplicate Opinions"));
const aggregate=new Function("$json",code("Aggregate Without Narrative"));
const items=[
  ["a","positive","capacity"],["b","negative","debt"],["c","positive","capacity"],
  ["d","neutral","valuation"],["e","positive","orders"],["f","negative","debt"]
].map(([id,sentiment,theme],i)=>({source_id:id,text:`Opinion ${id}`,url:`https://${i%2?'valuepickr.com':'writer.substack.com'}/${id}`,sentiment,confidence:0.8,themes:[theme]}));
const [validated]=validate({body:{ticker:"TEST",social_affects_bms:false,items}});
const [result]=aggregate(validated.json);
assert.equal(result.json.status,"available");
assert.equal(result.json.affectsBms,false);
assert.equal(result.json.sampleSize,6);
assert.ok(Math.abs(Object.values(result.json.sentiment).reduce((a,b)=>a+b,0)-1)<0.001);
assert.equal(result.json.themes[0].source_ids.length,2);
console.log("PASS: market-conversation aggregation");
