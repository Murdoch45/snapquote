// Diagnostic: run the deployed verifyJWT logic against a real token
// to find why production is rejecting valid tokens.
//
// Usage: node scripts/jwt-verify-diagnostic.mjs <token>
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_JWT_SECRET from .env.local
// (same way Vercel injects them in production).

import { createRemoteJWKSet, jwtVerify, decodeJwt, decodeProtectedHeader } from "jose";
import { readFileSync } from "fs";
import { join } from "path";

const envPath = join(process.cwd(), ".env.local");
const envText = readFileSync(envPath, "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const token = process.argv[2];
if (!token) {
  console.error("usage: node scripts/jwt-verify-diagnostic.mjs <token>");
  process.exit(1);
}

console.log("=== HEADER ===");
console.log(JSON.stringify(decodeProtectedHeader(token), null, 2));
console.log("\n=== PAYLOAD ===");
console.log(JSON.stringify(decodeJwt(token), null, 2));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
console.log("\n=== ENV ===");
console.log("NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl);
console.log("SUPABASE_JWT_SECRET present:", Boolean(process.env.SUPABASE_JWT_SECRET));

const jwksUrl = new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
const jwks = createRemoteJWKSet(jwksUrl);

console.log("\n=== ATTEMPT 1: ES256 via JWKS, audience='authenticated' ===");
try {
  const { payload, protectedHeader } = await jwtVerify(token, jwks, {
    audience: "authenticated"
  });
  console.log("OK");
  console.log("alg:", protectedHeader.alg);
  console.log("sub:", payload.sub);
} catch (e) {
  console.log("FAIL:", e?.code ?? e?.name, "-", e?.message);
}

console.log("\n=== ATTEMPT 1b: ES256 via JWKS, NO audience constraint ===");
try {
  const { payload, protectedHeader } = await jwtVerify(token, jwks);
  console.log("OK");
  console.log("alg:", protectedHeader.alg);
  console.log("sub:", payload.sub);
  console.log("aud:", payload.aud);
} catch (e) {
  console.log("FAIL:", e?.code ?? e?.name, "-", e?.message);
}

console.log("\n=== ATTEMPT 2: HS256, audience='authenticated' ===");
const secret = process.env.SUPABASE_JWT_SECRET?.trim();
if (!secret) {
  console.log("SKIP: SUPABASE_JWT_SECRET missing");
} else {
  const key = new TextEncoder().encode(secret);
  try {
    const { payload, protectedHeader } = await jwtVerify(token, key, {
      audience: "authenticated"
    });
    console.log("OK");
    console.log("alg:", protectedHeader.alg);
    console.log("sub:", payload.sub);
  } catch (e) {
    console.log("FAIL:", e?.code ?? e?.name, "-", e?.message);
  }
}
