#!/usr/bin/env node

/**
 * System Health Check - Verifies Entry Pass System is Working
 *
 * This script tests:
 * 1. Edge Function connectivity
 * 2. Response times with index optimization
 * 3. Overall system health
 *
 * Usage: node test-system-health.js <supabase-url> <anon-key>
 */

const SUPABASE_URL = process.argv[2];
const ANON_KEY = process.argv[3];

if (!SUPABASE_URL || !ANON_KEY) {
  console.error("Usage: node test-system-health.js <supabase-url> <anon-key>");
  process.exit(1);
}

const ENDPOINT = `${SUPABASE_URL}/functions/v1/entry_pass`;

console.log(
  "\n╔════════════════════════════════════════════════════════════════╗"
);
console.log(
  "║         RAJA TICKETING SYSTEM - HEALTH CHECK                  ║"
);
console.log(
  "╚════════════════════════════════════════════════════════════════╝\n"
);

console.log("🔍 Testing system health before event...\n");
console.log(`📍 Endpoint: ${ENDPOINT}\n`);

// Test 1: Basic connectivity
async function testConnectivity() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST 1: Edge Function Connectivity");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const startTime = Date.now();

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({
        action: "resolve",
        token: "test-token-connectivity",
      }),
    });

    const responseTime = Date.now() - startTime;

    console.log(`✅ Edge Function is reachable`);
    console.log(`⏱️  Response time: ${responseTime}ms`);
    console.log(
      `📊 HTTP Status: ${response.status} (${
        response.status === 400
          ? "Expected - invalid token"
          : response.statusText
      })`
    );

    if (responseTime < 1000) {
      console.log("✅ Response time is EXCELLENT (<1 second)");
    } else if (responseTime < 3000) {
      console.log("⚠️  Response time is acceptable but could be faster");
    } else {
      console.log("❌ Response time is SLOW (>3 seconds)");
    }

    return { success: true, responseTime };
  } catch (error) {
    console.log(`❌ Edge Function is NOT reachable`);
    console.log(`   Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Test 2: Load test (quick burst)
async function testConcurrentLoad() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST 2: Concurrent Load Test (20 users)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const concurrentUsers = 20;
  const startTime = Date.now();
  const responseTimes = [];

  const promises = Array.from({ length: concurrentUsers }, async (_, i) => {
    const reqStart = Date.now();
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({
          action: "resolve",
          token: `test-token-${i}`,
        }),
      });

      const responseTime = Date.now() - reqStart;
      responseTimes.push(responseTime);
      return { success: response.ok || response.status === 400, responseTime };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  const results = await Promise.all(promises);
  const duration = Date.now() - startTime;

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  if (responseTimes.length > 0) {
    responseTimes.sort((a, b) => a - b);
    const avg = Math.round(
      responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    );
    const min = responseTimes[0];
    const max = responseTimes[responseTimes.length - 1];
    const median = responseTimes[Math.floor(responseTimes.length / 2)];
    const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)];

    console.log(`📊 Results:`);
    console.log(`   Total requests: ${concurrentUsers}`);
    console.log(`   Completed: ${successful} requests`);
    console.log(`   Duration: ${duration}ms`);
    console.log(
      `   Throughput: ${Math.round(
        concurrentUsers / (duration / 1000)
      )} requests/sec`
    );
    console.log(``);
    console.log(`⏱️  Response Times:`);
    console.log(`   Min: ${min}ms`);
    console.log(`   Average: ${avg}ms`);
    console.log(`   Median: ${median}ms`);
    console.log(`   95th percentile: ${p95}ms`);
    console.log(`   Max: ${max}ms`);
    console.log(``);

    // Assess with database index optimization
    if (avg < 500 && p95 < 800) {
      console.log("✅ EXCELLENT - Database index is working optimally!");
      console.log("   Your system is ready for 100+ concurrent users");
    } else if (avg < 1000 && p95 < 2000) {
      console.log("✅ GOOD - Performance is acceptable");
      console.log("   System should handle event load fine");
    } else if (avg < 2000) {
      console.log("⚠️  ACCEPTABLE - Performance could be better");
      console.log("   Verify database index was created correctly");
    } else {
      console.log("❌ SLOW - Database index may be missing");
      console.log("   Check if index was created in Supabase");
    }

    return { avg, p95, successful, failed };
  } else {
    console.log("❌ No successful responses");
    return { avg: 0, p95: 0, successful: 0, failed };
  }
}

// Test 3: System recommendations
function printRecommendations(connectivityTest, loadTest) {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("FINAL ASSESSMENT & RECOMMENDATIONS");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  console.log("\n📋 System Status:");

  if (connectivityTest.success) {
    console.log("   ✅ Edge Functions: Online and responding");
  } else {
    console.log("   ❌ Edge Functions: Issue detected");
  }

  if (loadTest.avg < 500) {
    console.log("   ✅ Database Performance: Excellent (index working)");
  } else if (loadTest.avg < 1000) {
    console.log("   ✅ Database Performance: Good");
  } else if (loadTest.avg < 2000) {
    console.log("   ⚠️  Database Performance: Acceptable");
  } else {
    console.log("   ❌ Database Performance: Needs optimization");
  }

  if (loadTest.successful === 20) {
    console.log("   ✅ Reliability: 100% success rate");
  } else {
    console.log(
      `   ⚠️  Reliability: ${Math.round(
        (loadTest.successful / 20) * 100
      )}% success rate`
    );
  }

  console.log("\n🎯 Event Readiness:");

  if (
    connectivityTest.success &&
    loadTest.avg < 1000 &&
    loadTest.successful >= 19
  ) {
    console.log("   ✅ READY FOR PRODUCTION");
    console.log("   ✅ System can handle 100+ concurrent users");
    console.log("   ✅ Database index is optimized");
    console.log("   ✅ No action needed - you're good to go! 🚀");
  } else if (connectivityTest.success && loadTest.avg < 2000) {
    console.log("   ⚠️  READY BUT MONITOR CLOSELY");
    console.log("   ⚠️  Consider verifying database index");
    console.log("   ℹ️  System should work but may be slower under load");
  } else {
    console.log("   ❌ NEEDS ATTENTION");
    console.log("   ❌ Check database index creation");
    console.log("   ❌ Verify Supabase project status");
  }

  console.log("\n📝 Pre-Event Checklist:");
  console.log("   □ Database index verified (run verify-index.sql)");
  console.log("   □ Test entry pass link on mobile device");
  console.log("   □ Supabase dashboard open and monitoring");
  console.log("   □ Backup participant list printed");
  console.log("   □ Admin panel logged in and ready");

  console.log(
    "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
  );
}

// Run all tests
async function runHealthCheck() {
  const connectivityTest = await testConnectivity();
  const loadTest = await testConcurrentLoad();
  printRecommendations(connectivityTest, loadTest);
}

runHealthCheck().catch((error) => {
  console.error("\n❌ Health check failed:", error);
  process.exit(1);
});


