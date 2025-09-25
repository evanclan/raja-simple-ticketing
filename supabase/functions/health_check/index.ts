import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  checks: {
    database: { status: string; responseTime?: number; error?: string };
    email: { status: string; error?: string };
    environment: { status: string; missingVars?: string[] };
  };
  uptime: number;
  version: string;
}

const startTime = Date.now();

function requiredEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders();
  
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const result: HealthCheckResult = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    checks: {
      database: { status: "unknown" },
      email: { status: "unknown" },
      environment: { status: "unknown" },
    },
    uptime: Date.now() - startTime,
    version: "1.0.0",
  };

  // Check required environment variables
  const requiredVars = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ENTRY_JWT_SECRET",
    "ENTRY_ADMIN_PIN",
    "RESEND_API_KEY",
    "ALLOWED_FROM",
  ];
  
  const missingVars = requiredVars.filter(varName => !Deno.env.get(varName));
  
  if (missingVars.length > 0) {
    result.checks.environment = { status: "error", missingVars };
    result.status = "unhealthy";
  } else {
    result.checks.environment = { status: "ok" };
  }

  // Check database connectivity
  try {
    const startDb = Date.now();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (supabaseUrl && serviceKey) {
      const supabase = createClient(supabaseUrl, serviceKey);
      const { error } = await supabase
        .from("paidparticipants")
        .select("count", { count: "exact" })
        .limit(0);
      
      const responseTime = Date.now() - startDb;
      
      if (error) {
        result.checks.database = { status: "error", responseTime, error: error.message };
        result.status = result.status === "healthy" ? "degraded" : "unhealthy";
      } else {
        result.checks.database = { status: "ok", responseTime };
      }
    } else {
      result.checks.database = { status: "error", error: "Missing database credentials" };
      result.status = "unhealthy";
    }
  } catch (error) {
    result.checks.database = { status: "error", error: error.message };
    result.status = result.status === "healthy" ? "degraded" : "unhealthy";
  }

  // Check email service
  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (resendApiKey) {
      // Just check if the API key format is valid (starts with re_)
      if (resendApiKey.startsWith("re_")) {
        result.checks.email = { status: "ok" };
      } else {
        result.checks.email = { status: "error", error: "Invalid API key format" };
        result.status = result.status === "healthy" ? "degraded" : "unhealthy";
      }
    } else {
      result.checks.email = { status: "error", error: "Missing email API key" };
      result.status = "unhealthy";
    }
  } catch (error) {
    result.checks.email = { status: "error", error: error.message };
    result.status = result.status === "healthy" ? "degraded" : "unhealthy";
  }

  const statusCode = result.status === "healthy" ? 200 : 
                    result.status === "degraded" ? 200 : 503;

  return new Response(JSON.stringify(result, null, 2), {
    status: statusCode,
    headers: { 
      "Content-Type": "application/json", 
      "Cache-Control": "no-cache",
      ...corsHeaders 
    },
  });
});
