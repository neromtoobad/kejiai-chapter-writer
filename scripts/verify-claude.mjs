/**
 * Phase 0 — Claude API connectivity check.
 *
 * Usage:
 *   1. Put a real key in .env.local:  ANTHROPIC_API_KEY=sk-ant-...
 *   2. From the chapterai/ root:      node --env-file=.env.local scripts/verify-claude.mjs
 *
 * Streams a short response from claude-sonnet-4-20250514. Token-by-token output
 * confirms the SDK is wired and streaming is reaching the terminal.
 */

import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey || apiKey === "sk-..." || !apiKey.startsWith("sk-")) {
  console.error(
    "ANTHROPIC_API_KEY is missing or still the placeholder. Set it in .env.local first."
  );
  process.exit(1);
}

const client = new Anthropic({ apiKey });

console.log("Calling claude-sonnet-4-20250514 with streaming...\n");

const stream = client.messages.stream({
  model: "claude-sonnet-4-20250514",
  max_tokens: 64,
  messages: [
    {
      role: "user",
      content:
        'Reply with exactly the phrase: "KejiAI connectivity verified." Nothing else.',
    },
  ],
});

stream.on("text", (delta) => {
  process.stdout.write(delta);
});

const finalMessage = await stream.finalMessage();
console.log("\n\n--- done ---");
console.log("stop_reason:", finalMessage.stop_reason);
console.log("usage:", finalMessage.usage);
