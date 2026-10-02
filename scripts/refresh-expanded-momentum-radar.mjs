import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const outputRoot = path.resolve(process.env.MOMENTUM_RADAR_OUTPUT_ROOT || "output/momentum-daily");
const cacheRoot = path.resolve(process.env.MOMENTUM_RADAR_CACHE_ROOT || "output/momentum-market-cache-expanded");
const basePath = path.join(outputRoot, "base.json");
const finalPath = path.join(outputRoot, "current.json");
const seedPath = path.resolve(process.env.MOMENTUM_RADAR_SEED || "src/data/bmsMomentumRadarExpanded.json");
const objectName = process.env.MOMENTUM_RADAR_OBJECT || "momentum-radar/current.json";

function latestCompletedIndianSessionDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const read = (type) => Number(parts.find((part) => part.type === type)?.value);
  const istDate = new Date(Date.UTC(read("year"), read("month") - 1, read("day")));
  if (read("hour") < 16) istDate.setUTCDate(istDate.getUTCDate() - 1);
  while (istDate.getUTCDay() === 0 || istDate.getUTCDay() === 6) istDate.setUTCDate(istDate.getUTCDate() - 1);
  return istDate.toISOString().slice(0, 10);
}

function run(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: root, stdio: "inherit", env: process.env });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${script} exited with code ${code}`)));
  });
}

async function metadataToken() {
  const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
    headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Metadata token request failed: ${response.status}`);
  const payload = await response.json();
  if (!payload.access_token) throw new Error("Metadata token response did not contain an access token");
  return payload.access_token;
}

async function uploadVerifiedSnapshot() {
  const bucket = process.env.MOMENTUM_RADAR_BUCKET;
  if (!bucket) throw new Error("MOMENTUM_RADAR_BUCKET is required for publication");
  const token = await metadataToken();
  const bytes = fs.readFileSync(finalPath);
  const response = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: bytes,
  });
  if (!response.ok) throw new Error(`Momentum Radar upload failed: ${response.status} ${await response.text()}`);
}

async function main() {
  fs.mkdirSync(outputRoot, { recursive: true });
  const completedSession = process.env.MOMENTUM_RADAR_AS_OF || latestCompletedIndianSessionDate();
  await run("scripts/build-bms-momentum-radar.mjs", [
    "--policy=config/momentum-radar-policy-v1.json", `--universe=${seedPath}`, "--expected=2558", `--output=${basePath}`, `--cache=${cacheRoot}`,
    "--refresh-cache=true", `--as-of=${completedSession}`, `--concurrency=${process.env.MOMENTUM_RADAR_FETCH_CONCURRENCY || 12}`,
  ]);
  await run("scripts/finalize-expanded-momentum-radar.mjs", [`--input=${basePath}`, `--seed=${seedPath}`, `--output=${finalPath}`]);
  await run("scripts/enrich-momentum-current-triggers.mjs", [`--radar=${finalPath}`, `--cache=${cacheRoot}`]);
  await run("scripts/verify-bms-momentum-radar.mjs", [`--input=${finalPath}`]);
  await uploadVerifiedSnapshot();
  const radar = JSON.parse(fs.readFileSync(finalPath, "utf8"));
  console.log(JSON.stringify({ status: "published", requested_completed_session: completedSession, generated_at: radar.generated_at, market_data_through: radar.market_data.as_of_date, companies: radar.companies.length, bucket: process.env.MOMENTUM_RADAR_BUCKET, object: objectName }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
