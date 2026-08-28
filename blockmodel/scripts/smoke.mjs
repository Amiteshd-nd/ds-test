// One smoke check: prove the KIRI integration is wired up (key + network + auth)
// by fetching the account balance. Costs 0 credits.
//
// Run:  npm run smoke
import fs from "node:fs";
import path from "node:path";

// Minimal .env.local reader (no dotenv dependency).
function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return {};
  const env = {};
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv();
const key = env.KIRI_API_KEY || process.env.KIRI_API_KEY;
const base = (env.KIRI_BASE_URL || process.env.KIRI_BASE_URL || "https://api.kiriengine.app/api").replace(/\/$/, "");

if (!key || key.startsWith("kiri-your-key")) {
  console.error("✗ No KIRI_API_KEY found in .env.local. Copy .env.example and add your key.");
  process.exit(1);
}

const url = `${base}/v1/open/balance`;
console.log(`→ GET ${url}`);

try {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.code !== 0) {
    console.error(`✗ KIRI returned HTTP ${res.status}:`, json ?? "(no body)");
    process.exit(1);
  }
  console.log(`✓ KIRI reachable. Balance: ${json.data.balance} credit(s).`);
  console.log("✓ Smoke check passed — the KIRI integration is wired up correctly.");
  process.exit(0);
} catch (err) {
  console.error("✗ Could not reach KIRI:", err.message);
  process.exit(1);
}
