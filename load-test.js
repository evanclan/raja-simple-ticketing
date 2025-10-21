#!/usr/bin/env node

/**
 * Load Testing Script for Entry Pass System
 *
 * This script simulates concurrent users accessing their entry passes
 * to verify the system can handle high traffic during the event.
 *
 * Usage:
 *   node load-test.js <concurrent-users> <supabase-url> <anon-key> <test-token>
 *
 * Example:
 *   node load-test.js 100 https://xxx.supabase.co your-anon-key test-jwt-token
 *
 * Requirements:
 *   - Node.js 18+
 *   - No additional dependencies (uses built-in fetch)
 */

const CONCURRENT_USERS = parseInt(process.argv[2]) || 50;
const SUPABASE_URL = process.argv[3];
const ANON_KEY = process.argv[4];
const TEST_TOKEN = process.argv[5];

if (!SUPABASE_URL || !ANON_KEY) {
  console.error(
    "Usage: node load-test.js <concurrent-users> <supabase-url> <anon-key> [test-token]"
  );
  console.error("");
  console.error("Example:");
  console.error(
    "  node load-test.js 100 https://xxx.supabase.co your-anon-key test-jwt-token"
  );
  console.error("");
  console.error(
    "Note: If test-token is not provided, it will make a request without token"
  );
  console.error("      (which will fail but still tests system load)");
  process.exit(1);
}

const ENDPOINT = `${SUPABASE_URL}/functions/v1/entry_pass`;

// Statistics tracking
const stats = {
  total: 0,
  success: 0,
  failed: 0,
  timeouts: 0,
  errors: {},
  responseTimes: [],
  startTime: null,
  endTime: null,
};

// Simulate a single user accessing their entry pass
async function simulateUser(userId) {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({
        action: "resolve",
        token: TEST_TOKEN || "test-token-" + userId,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;
    stats.responseTimes.push(responseTime);

    if (response.ok) {
      stats.success++;
      console.log(`✅ User ${userId}: Success (${responseTime}ms)`);
      return { success: true, responseTime, userId };
    } else {
      stats.failed++;
      const errorText = await response.text();
      const errorMsg = `HTTP ${response.status}`;
      stats.errors[errorMsg] = (stats.errors[errorMsg] || 0) + 1;
      console.log(
        `❌ User ${userId}: Failed - ${errorMsg} (${responseTime}ms)`
      );
      return { success: false, responseTime, userId, error: errorMsg };
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;

    if (error.name === "AbortError") {
      stats.timeouts++;
      stats.errors["Timeout"] = (stats.errors["Timeout"] || 0) + 1;
      console.log(`⏱️  User ${userId}: Timeout (${responseTime}ms)`);
      return { success: false, responseTime, userId, error: "Timeout" };
    }

    stats.failed++;
    const errorMsg = error.message || "Unknown error";
    stats.errors[errorMsg] = (stats.errors[errorMsg] || 0) + 1;
    console.log(`❌ User ${userId}: Error - ${errorMsg}`);
    return { success: false, responseTime, userId, error: errorMsg };
  } finally {
    stats.total++;
  }
}

// Calculate statistics
function calculateStats() {
  if (stats.responseTimes.length === 0) {
    return {
      min: 0,
      max: 0,
      avg: 0,
      median: 0,
      p95: 0,
      p99: 0,
    };
  }

  const sorted = [...stats.responseTimes].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(sum / sorted.length),
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
  };
}

// Display final report
function displayReport() {
  const duration = (stats.endTime - stats.startTime) / 1000;
  const timeStats = calculateStats();
  const successRate = ((stats.success / stats.total) * 100).toFixed(2);

  console.log("\n" + "=".repeat(70));
  console.log("LOAD TEST RESULTS");
  console.log("=".repeat(70));
  console.log(`Test Configuration:`);
  console.log(`  Concurrent Users: ${CONCURRENT_USERS}`);
  console.log(`  Endpoint: ${ENDPOINT}`);
  console.log(
    `  Test Token: ${TEST_TOKEN ? "Provided" : "Not provided (will fail)"}`
  );
  console.log("");
  console.log(`Summary:`);
  console.log(`  Total Requests: ${stats.total}`);
  console.log(`  Successful: ${stats.success} (${successRate}%)`);
  console.log(`  Failed: ${stats.failed}`);
  console.log(`  Timeouts: ${stats.timeouts}`);
  console.log(`  Duration: ${duration.toFixed(2)}s`);
  console.log(`  Requests/sec: ${(stats.total / duration).toFixed(2)}`);
  console.log("");
  console.log(`Response Times:`);
  console.log(`  Min: ${timeStats.min}ms`);
  console.log(`  Average: ${timeStats.avg}ms`);
  console.log(`  Median: ${timeStats.median}ms`);
  console.log(`  95th percentile: ${timeStats.p95}ms`);
  console.log(`  99th percentile: ${timeStats.p99}ms`);
  console.log(`  Max: ${timeStats.max}ms`);
  console.log("");

  if (Object.keys(stats.errors).length > 0) {
    console.log(`Error Breakdown:`);
    Object.entries(stats.errors)
      .sort((a, b) => b[1] - a[1])
      .forEach(([error, count]) => {
        console.log(`  ${error}: ${count} times`);
      });
    console.log("");
  }

  console.log(`Assessment:`);
  if (successRate >= 99 && timeStats.p95 < 2000) {
    console.log(`  ✅ EXCELLENT - System is ready for production`);
  } else if (successRate >= 95 && timeStats.p95 < 5000) {
    console.log(`  ⚠️  ACCEPTABLE - System should work but monitor closely`);
  } else {
    console.log(
      `  ❌ NEEDS IMPROVEMENT - Issues detected, see recommendations below`
    );
  }
  console.log("");

  if (successRate < 99) {
    console.log(`Recommendations:`);
    if (stats.timeouts > 0) {
      console.log(
        `  - High timeout rate detected. Check Edge Function performance.`
      );
    }
    if (timeStats.p95 > 5000) {
      console.log(
        `  - Slow response times. Verify database indexes are created.`
      );
      console.log(`  - Run: database_optimization.sql in Supabase SQL editor`);
    }
    if (stats.failed > stats.total * 0.1) {
      console.log(`  - High failure rate. Check Edge Function logs.`);
      console.log(`  - Verify ENTRY_JWT_SECRET is set correctly.`);
    }
  }

  console.log("=".repeat(70));
}

// Run the load test
async function runLoadTest() {
  console.log(
    `Starting load test with ${CONCURRENT_USERS} concurrent users...`
  );
  console.log(`Target: ${ENDPOINT}`);
  console.log("");

  stats.startTime = Date.now();

  // Create array of user simulations
  const users = Array.from({ length: CONCURRENT_USERS }, (_, i) => i + 1);

  // Run all simulations concurrently
  const results = await Promise.all(
    users.map((userId) => simulateUser(userId))
  );

  stats.endTime = Date.now();

  // Display report
  displayReport();

  // Exit with error code if success rate is too low
  const successRate = (stats.success / stats.total) * 100;
  process.exit(successRate >= 95 ? 0 : 1);
}

// Handle Ctrl+C gracefully
process.on("SIGINT", () => {
  console.log("\n\nTest interrupted by user");
  stats.endTime = Date.now();
  displayReport();
  process.exit(1);
});

// Run the test
runLoadTest().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
