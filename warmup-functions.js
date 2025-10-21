#!/usr/bin/env node

/**
 * Edge Function Warmup Script
 *
 * This script "warms up" Supabase Edge Functions by making multiple requests
 * before the event starts. This keeps the functions in memory and reduces
 * cold start latency when real users access the system.
 *
 * Usage:
 *   node warmup-functions.js <supabase-url> <anon-key>
 *
 * Example:
 *   node warmup-functions.js https://xxx.supabase.co your-anon-key
 *
 * Run this 5-10 minutes before the event starts, and optionally
 * keep it running in the background during the event.
 */

const SUPABASE_URL = process.argv[2];
const ANON_KEY = process.argv[3];

if (!SUPABASE_URL || !ANON_KEY) {
  console.error("Usage: node warmup-functions.js <supabase-url> <anon-key>");
  console.error("");
  console.error("Example:");
  console.error(
    "  node warmup-functions.js https://xxx.supabase.co your-anon-key"
  );
  process.exit(1);
}

const ENDPOINTS = [
  {
    name: "entry_pass (resolve)",
    url: `${SUPABASE_URL}/functions/v1/entry_pass`,
    body: { action: "resolve", token: "warmup-token-will-fail-gracefully" },
  },
  {
    name: "health_check",
    url: `${SUPABASE_URL}/functions/v1/health_check`,
    body: {},
  },
];

// Statistics
let totalRequests = 0;
let successfulWarmups = 0;
let isRunning = true;

async function warmupEndpoint(endpoint) {
  try {
    const startTime = Date.now();
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify(endpoint.body),
    });

    const duration = Date.now() - startTime;
    totalRequests++;

    // For warmup purposes, we don't care if the request "succeeds"
    // We just want to trigger the function to keep it warm
    // Even 400/403 errors mean the function is running
    if (response.status < 500) {
      successfulWarmups++;
      console.log(
        `✅ ${endpoint.name}: Warmed (${duration}ms, HTTP ${response.status})`
      );
    } else {
      console.log(
        `⚠️  ${endpoint.name}: Server error (${duration}ms, HTTP ${response.status})`
      );
    }

    return { success: true, duration };
  } catch (error) {
    totalRequests++;
    console.log(`❌ ${endpoint.name}: Error - ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function warmupCycle() {
  console.log(
    "\n" + new Date().toLocaleTimeString() + " - Starting warmup cycle..."
  );

  // Warm up all endpoints concurrently
  await Promise.all(ENDPOINTS.map((endpoint) => warmupEndpoint(endpoint)));

  console.log(
    `Cycle complete. Total: ${totalRequests} requests, ${successfulWarmups} successful\n`
  );
}

async function continuousWarmup() {
  console.log("=".repeat(70));
  console.log("EDGE FUNCTION WARMUP");
  console.log("=".repeat(70));
  console.log(`Target: ${SUPABASE_URL}`);
  console.log(`Functions: ${ENDPOINTS.map((e) => e.name).join(", ")}`);
  console.log("");
  console.log(
    "This script will make periodic requests to keep Edge Functions warm."
  );
  console.log("Press Ctrl+C to stop.");
  console.log("=".repeat(70));
  console.log("");

  // Initial burst: 5 warmup cycles with 1 second delay
  console.log("Initial warmup burst (5 cycles)...");
  for (let i = 0; i < 5; i++) {
    await warmupCycle();
    if (i < 4) await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log("✅ Initial warmup complete!");
  console.log("");
  console.log("Entering maintenance mode (warmup every 30 seconds)...");
  console.log(
    "Keep this script running during the event for best performance."
  );
  console.log("");

  // Continuous warmup: every 30 seconds
  while (isRunning) {
    await new Promise((resolve) => setTimeout(resolve, 30000)); // 30 seconds
    if (isRunning) {
      await warmupCycle();
    }
  }
}

// Handle Ctrl+C gracefully
process.on("SIGINT", () => {
  console.log("\n\nStopping warmup script...");
  console.log(`Total requests sent: ${totalRequests}`);
  console.log(`Successful warmups: ${successfulWarmups}`);
  console.log("");
  console.log("Edge Functions should stay warm for a few more minutes.");
  isRunning = false;
  process.exit(0);
});

// Run the warmup
continuousWarmup().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
