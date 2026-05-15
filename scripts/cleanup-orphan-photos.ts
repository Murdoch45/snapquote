/**
 * One-time cleanup: deletes files in the `lead-photos` Supabase Storage bucket
 * that are NOT referenced by a row in `public.lead_photos`.
 *
 * Background: on 2026-05-15 a mass DB cleanup (73 orgs + 3,250 falconn leads
 * older than 7 days) cascade-deleted the `lead_photos` rows but left the
 * underlying storage objects orphaned, driving Supabase egress past Free-tier
 * cap. Supabase blocks direct SQL deletes against `storage.objects`, and the
 * dashboard's folder-delete fails on large folders, so we go through the
 * Storage API.
 *
 * Usage:
 *   # Dry run (default): list orphans, delete nothing
 *   npx tsx scripts/cleanup-orphan-photos.ts
 *
 *   # Actually delete
 *   npx tsx scripts/cleanup-orphan-photos.ts --execute
 *
 * Reads SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL from .env.local
 * (relative to CWD — invoke from repo root).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as dotenvConfig } from "dotenv";
import path from "node:path";
import readline from "node:readline";

dotenvConfig({ path: path.resolve(process.cwd(), ".env.local") });

const BUCKET = "lead-photos";
const DELETE_BATCH = 100;
const TABLE_PAGE_SIZE = 1000;
const STORAGE_REST_PAGE = 1000;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local. Aborting."
  );
  process.exit(1);
}

const EXECUTE = process.argv.includes("--execute");

const admin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type FoundFile = { path: string; size: number };

async function loadKeepSet(): Promise<Set<string>> {
  const keep = new Set<string>();
  let from = 0;
  while (true) {
    const { data, error } = await admin
      .from("lead_photos")
      .select("storage_path")
      .range(from, from + TABLE_PAGE_SIZE - 1);
    if (error) {
      console.error("Failed to read lead_photos:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      const p = (row as { storage_path: string | null }).storage_path;
      if (p) keep.add(p);
    }
    if (data.length < TABLE_PAGE_SIZE) break;
    from += TABLE_PAGE_SIZE;
  }
  return keep;
}

// Storage list endpoint gateway-times-out intermittently on busy buckets.
async function listWithRetry(
  prefix: string,
  offset: number,
): Promise<{ name: string; id: string | null; metadata: unknown }[]> {
  const MAX_ATTEMPTS = 6;
  let lastErr: string | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix, {
      limit: STORAGE_REST_PAGE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (!error && data) {
      return data as { name: string; id: string | null; metadata: unknown }[];
    }
    lastErr = error?.message ?? "unknown";
    const backoffMs = 500 * Math.pow(2, attempt);
    console.warn(
      `  list(${prefix}, offset=${offset}) attempt ${attempt + 1}/${MAX_ATTEMPTS} failed: ${lastErr} — retrying in ${backoffMs}ms`,
    );
    await new Promise((r) => setTimeout(r, backoffMs));
  }
  throw new Error(`list(${prefix}) gave up after ${MAX_ATTEMPTS} attempts: ${lastErr}`);
}

async function listAllFiles(prefix: string, out: FoundFile[]): Promise<void> {
  let offset = 0;
  while (true) {
    const data = await listWithRetry(prefix, offset);
    if (data.length === 0) return;
    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Folder entries have no id (Supabase convention).
      if (entry.id === null || entry.id === undefined) {
        await listAllFiles(full, out);
      } else {
        const size =
          (entry.metadata &&
            typeof (entry.metadata as { size?: unknown }).size === "number" &&
            ((entry.metadata as { size: number }).size as number)) ||
          0;
        out.push({ path: full, size });
      }
    }
    if (data.length < STORAGE_REST_PAGE) return;
    offset += STORAGE_REST_PAGE;
  }
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function promptYes(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise<boolean>((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "yes");
    });
  });
}

async function main() {
  console.log(`Mode: ${EXECUTE ? "EXECUTE (will delete)" : "DRY RUN (no deletes)"}`);
  console.log(`Bucket: ${BUCKET}`);
  console.log("Loading keep-set from lead_photos table...");
  const keep = await loadKeepSet();
  console.log(`  keep-set size: ${keep.size}`);

  console.log("Listing bucket files (recursing)...");
  const found: FoundFile[] = [];
  await listAllFiles("", found);
  console.log(`  files found in bucket: ${found.length}`);

  const totalBytes = found.reduce((a, b) => a + b.size, 0);
  const orphans: FoundFile[] = [];
  const missingInBucket: string[] = [];
  const foundSet = new Set(found.map((f) => f.path));
  for (const k of keep) {
    if (!foundSet.has(k)) missingInBucket.push(k);
  }
  for (const f of found) {
    if (!keep.has(f.path)) orphans.push(f);
  }
  const orphanBytes = orphans.reduce((a, b) => a + b.size, 0);

  console.log("");
  console.log("=== Summary ===");
  console.log(`Bucket files total       : ${found.length}`);
  console.log(`Bucket bytes total       : ${fmtBytes(totalBytes)}`);
  console.log(`lead_photos rows (keep)  : ${keep.size}`);
  console.log(`Files to KEEP            : ${found.length - orphans.length}`);
  console.log(`Files to DELETE (orphans): ${orphans.length}`);
  console.log(`Bytes to be FREED        : ${fmtBytes(orphanBytes)} (${orphanBytes} B)`);
  if (missingInBucket.length > 0) {
    console.log(
      `WARN: ${missingInBucket.length} lead_photos row(s) point to paths NOT in the bucket. ` +
        "Listing first 10:"
    );
    for (const p of missingInBucket.slice(0, 10)) console.log(`  - ${p}`);
  }

  if (orphans.length === 0) {
    console.log("\nNothing to delete. Done.");
    return;
  }

  if (!EXECUTE) {
    console.log("\nDry run — no deletes performed. Re-run with --execute to delete.");
    console.log("Sample of orphans (first 10):");
    for (const o of orphans.slice(0, 10)) {
      console.log(`  - ${o.path}  (${fmtBytes(o.size)})`);
    }
    return;
  }

  const ok = await promptYes(
    `\nDelete ${orphans.length} files (${fmtBytes(orphanBytes)})? Type "yes" to proceed: `
  );
  if (!ok) {
    console.log("Aborted by user.");
    return;
  }

  let deleted = 0;
  let failed = 0;
  const failures: { batchStart: number; error: string }[] = [];
  for (let i = 0; i < orphans.length; i += DELETE_BATCH) {
    const batch = orphans.slice(i, i + DELETE_BATCH);
    const paths = batch.map((b) => b.path);
    const { data, error } = await admin.storage.from(BUCKET).remove(paths);
    if (error) {
      failed += batch.length;
      failures.push({ batchStart: i, error: error.message });
      console.log(
        `  batch ${i / DELETE_BATCH + 1}: FAILED (${error.message}) — ${batch.length} files`
      );
      continue;
    }
    const removedCount = Array.isArray(data) ? data.length : 0;
    deleted += removedCount;
    const missed = batch.length - removedCount;
    if (missed > 0) failed += missed;
    console.log(
      `  batch ${i / DELETE_BATCH + 1}/${Math.ceil(orphans.length / DELETE_BATCH)}: ` +
        `${removedCount}/${batch.length} removed (running total: ${deleted})`
    );
  }

  console.log("");
  console.log("=== Done ===");
  console.log(`Deleted     : ${deleted}`);
  console.log(`Failed      : ${failed}`);
  console.log(`Bytes freed : ${fmtBytes(orphanBytes)} (approx — based on pre-delete metadata)`);
  if (failures.length > 0) {
    console.log("\nFailures by batch:");
    for (const f of failures) console.log(`  - batch starting @${f.batchStart}: ${f.error}`);
  }
}

main().catch((err) => {
  console.error("cleanup-orphan-photos failed:", err);
  process.exit(1);
});
