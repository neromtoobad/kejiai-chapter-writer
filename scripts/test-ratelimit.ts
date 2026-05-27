/** Smoke test for /lib/ratelimit.ts. Run: npx tsx scripts/test-ratelimit.ts */

import {
  __resetRateLimitForTests,
  formatRetryAfter,
  rateLimit,
} from "../lib/ratelimit";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) {
    console.log(`  pass ${label}`);
    pass++;
  } else {
    console.error(`  FAIL ${label}`);
    fail++;
  }
}

console.log("\n[basic window]");
__resetRateLimitForTests();
const cfg = { limit: 3, windowMs: 60_000 };
let r = rateLimit("a", cfg);
ok(r.ok && r.remaining === 2, "1/3 allowed, 2 remain");
r = rateLimit("a", cfg);
ok(r.ok && r.remaining === 1, "2/3 allowed, 1 remain");
r = rateLimit("a", cfg);
ok(r.ok && r.remaining === 0, "3/3 allowed, 0 remain");
r = rateLimit("a", cfg);
ok(!r.ok && r.remaining === 0, "4th rejected");
ok(r.resetAt > Date.now(), "resetAt in the future");

console.log("\n[keys are isolated]");
const r2 = rateLimit("b", cfg);
ok(r2.ok && r2.remaining === 2, "different key has fresh budget");

console.log("\n[rejection does not consume budget]");
__resetRateLimitForTests();
for (let i = 0; i < 3; i++) rateLimit("c", cfg);
const before = rateLimit("c", cfg); // rejected
const after = rateLimit("c", cfg); // also rejected, same resetAt
ok(!before.ok && !after.ok, "both rejected");
ok(before.resetAt === after.resetAt, "rejection does not move resetAt");

async function main() {
  console.log("\n[window resets after expiry]");
  __resetRateLimitForTests();
  const shortCfg = { limit: 1, windowMs: 50 };
  rateLimit("d", shortCfg);
  const blocked = rateLimit("d", shortCfg);
  ok(!blocked.ok, "blocked while window open");
  await new Promise((r) => setTimeout(r, 80));
  const fresh = rateLimit("d", shortCfg);
  ok(fresh.ok && fresh.remaining === 0, "fresh budget after window expires");

  console.log("\n[formatRetryAfter]");
  ok(formatRetryAfter(0) === "1 second", "clamp to 1");
  ok(formatRetryAfter(45) === "45 seconds", "seconds");
  ok(formatRetryAfter(60) === "1 minute", "minute boundary");
  ok(formatRetryAfter(120) === "2 minutes", "plural minutes");
  ok(formatRetryAfter(3600) === "1 hour", "hour boundary");
  ok(formatRetryAfter(7200) === "2 hours", "plural hours");

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
void main();
