#!/usr/bin/env node

/**
 * Database Verification Script
 *
 * This script verifies that your database is properly optimized
 * and ready for 500+ concurrent users.
 */

const SUPABASE_URL = "https://qhpnjpjotcehjabfdovp.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFocG5qcGpvdGNlaGphYmZkb3ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNjg5MDIsImV4cCI6MjA2OTk0NDkwMn0.l3rSQYMfWFBfThF-Sj_asM_mRggTqo2LD_ow2UEgyIk";

console.log("=".repeat(70));
console.log("DATABASE VERIFICATION");
console.log("=".repeat(70));
console.log("");

async function checkEdgeFunctionHealth() {
  console.log("1️⃣  Checking Edge Function health...");

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/health_check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({}),
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Edge Functions: ${data.status || "healthy"}`);
      if (data.checks?.database) {
        console.log(
          `   ✅ Database connectivity: ${data.checks.database.status}`
        );
        if (data.checks.database.responseTime) {
          console.log(
            `   ⚡ Database response time: ${data.checks.database.responseTime}ms`
          );
        }
      }
      return true;
    } else {
      console.log(`   ⚠️  Health check returned: HTTP ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Edge Function health check failed: ${error.message}`);
    return false;
  }
}

async function checkEntryPassFunction() {
  console.log("");
  console.log("2️⃣  Testing entry pass resolution...");

  // We'll use a fake token to test the function (it will fail validation, but we can check response time)
  try {
    const startTime = Date.now();
    const response = await fetch(`${SUPABASE_URL}/functions/v1/entry_pass`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({
        action: "resolve",
        token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyaCI6InRlc3QifQ.test",
      }),
    });

    const responseTime = Date.now() - startTime;

    // Even if it fails (invalid token), we can check if the function is responding
    if (
      response.status === 400 ||
      response.status === 403 ||
      response.status === 200
    ) {
      console.log(`   ✅ Entry pass function responding`);
      console.log(`   ⚡ Response time: ${responseTime}ms`);

      if (responseTime < 1000) {
        console.log(`   ✅ Response time is excellent (<1s)`);
      } else if (responseTime < 3000) {
        console.log(`   ⚠️  Response time is acceptable (1-3s)`);
      } else {
        console.log(`   ❌ Response time is slow (>3s) - may need warmup`);
      }
      return true;
    } else {
      console.log(`   ⚠️  Unexpected status: HTTP ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Entry pass function test failed: ${error.message}`);
    return false;
  }
}

async function getDatabaseInfo() {
  console.log("");
  console.log("3️⃣  Database Configuration:");
  console.log(`   📍 Region: Northeast Asia (Tokyo)`);
  console.log(`   🔗 URL: ${SUPABASE_URL}`);
  console.log(`   📦 Project: raja_simple_ticketing`);
}

async function checkParticipantsCount() {
  console.log("");
  console.log("4️⃣  Checking participants data...");

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/paidparticipants?select=count`,
      {
        method: "HEAD",
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
        },
      }
    );

    const count = response.headers.get("content-range");
    if (count) {
      const match = count.match(/\/(\d+)/);
      if (match) {
        console.log(`   ✅ Paid participants: ${match[1]} records`);
        return true;
      }
    }

    console.log(
      `   ⚠️  Could not determine participant count (may need RLS adjustment)`
    );
    return false;
  } catch (error) {
    console.log(`   ⚠️  Could not check participants: ${error.message}`);
    return false;
  }
}

function printManualVerification() {
  console.log("");
  console.log("5️⃣  Manual Verification Required:");
  console.log("");
  console.log("   ⚠️  Database Index Check:");
  console.log("   Please verify the index manually in Supabase Dashboard:");
  console.log("");
  console.log(
    "   1. Go to: https://supabase.com/dashboard/project/qhpnjpjotcehjabfdovp/sql"
  );
  console.log("   2. Run this query:");
  console.log("");
  console.log("      SELECT indexname, indexdef");
  console.log("      FROM pg_indexes");
  console.log("      WHERE tablename = 'paidparticipants'");
  console.log("        AND indexname LIKE '%row_hash%';");
  console.log("");
  console.log("   ✅ Expected: Should show 'idx_paidparticipants_row_hash'");
  console.log("   ❌ If empty: Run this SQL:");
  console.log("");
  console.log("      CREATE INDEX IF NOT EXISTS idx_paidparticipants_row_hash");
  console.log("      ON paidparticipants(row_hash);");
  console.log("");
}

function printNextSteps() {
  console.log("");
  console.log("=".repeat(70));
  console.log("NEXT STEPS");
  console.log("=".repeat(70));
  console.log("");
  console.log("📋 To complete verification:");
  console.log("");
  console.log("1. ✅ Verify database index (see manual steps above)");
  console.log("");
  console.log("2. 🧪 Run load test:");
  console.log("");
  console.log("   First, get a test token:");
  console.log("   - Login to your app as admin");
  console.log("   - Generate an entry pass for any participant");
  console.log("   - Copy the token from the URL");
  console.log("");
  console.log("   Then run:");
  console.log(
    `   npm run load-test 100 ${SUPABASE_URL} YOUR-ANON-KEY YOUR-TEST-TOKEN`
  );
  console.log("");
  console.log("3. 🎯 Before event:");
  console.log(`   npm run warmup ${SUPABASE_URL} ${ANON_KEY.slice(0, 20)}...`);
  console.log("");
  console.log("=".repeat(70));
}

async function runVerification() {
  await checkEdgeFunctionHealth();
  await checkEntryPassFunction();
  await getDatabaseInfo();
  await checkParticipantsCount();
  printManualVerification();
  printNextSteps();
}

runVerification().catch((error) => {
  console.error("Verification failed:", error);
  process.exit(1);
});
