// One-off seed script for Pacific Edge Property Care demo org. Safe to delete after use.
//
// Reads the LEADS.json manifest produced by snapquote-seed-leads.zip and:
//   1. Creates a fresh contractor org (Pacific Edge Property Care, BUSINESS plan, 100 credits).
//   2. Creates the owner auth user (jose@pacificedgepropertycare.com) with a printed password.
//   3. For each of the 10 leads:
//        - Uploads the lead's photos to the lead-photos Supabase Storage bucket at
//          `${orgId}/${tempLeadId}/${randomUUID()}.${ext}` (same path convention the
//          public /api/public/lead-photo-upload route uses).
//        - Inserts the lead row with ai_status='processing' (same initial state the
//          public /api/public/lead-submit route writes).
//        - Inserts the lead_photos rows referencing the uploaded paths + 24h signed URLs.
//        - Fires the AI estimator via triggerEstimatorForLead() — the same call the
//          public submit handler makes. The estimator runs server-side on the production
//          Supabase Edge Function + Vercel internal endpoint. No fake AI values.
//   4. Polls until every lead has ai_status='ready' (or 'failed').
//   5. Inserts a lead_unlocks row for each lead (service-role bypass; credits NOT decremented).
//   6. Mints a DRAFT quote per lead using the same shape /api/app/leads/unlock writes.
//   7. Staggers submitted_at across the past ~36h (random, unique minutes), with
//      ai_generated_at a realistic 30-180s after each submitted_at.
//   8. Ensures monthly_credits = 100 at the end.
//
// Usage:
//   npm run seed:pacific-edge   (after the seed:pacific-edge script alias is added)
//   OR: tsx scripts/seed-demo-leads.ts --photos-dir <path-to-unzipped-seed-photos>
//
// Required env (loaded from .env.local):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// CLI args (all optional):
//   --photos-dir <path>     Path to the unzipped seed-photos/ folder containing LEADS.json
//                           Default: C:\Users\murdo\AppData\Local\Temp\snapquote-seed-*\seed-photos
//   --dry-run               Don't write to the DB; print what would happen.
//   --skip-org              Reuse an existing Pacific Edge org if one exists.

import { randomBytes, randomUUID } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://snapquote.us";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
}
if (!INTERNAL_API_SECRET) {
  throw new Error(
    "Missing INTERNAL_API_SECRET in .env.local. The script POSTs to /api/internal/run-estimator " +
    "directly (rather than via the Supabase Edge Function) because local sb_secret_-format " +
    "service-role keys are rejected by the Edge Function's JWT validator."
  );
}

// ---------- types ----------

type LeadManifest = {
  lead_number: number;
  folder: string;
  service_category: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  address_full: string;
  job_city: string;
  job_state: string;
  job_zip: string;
  description: string;
};

type Manifest = {
  org: {
    name: string;
    owner_email: string;
    city: string;
    state: string;
    plan: "SOLO" | "TEAM" | "BUSINESS";
    credits: number;
    services_offered: string[];
  };
  leads: LeadManifest[];
};

type ServiceQuestionAnswers = Record<string, string | string[]>;

// ---------- service mapping ----------

const SERVICE_TYPE_MAP: Record<string, string> = {
  pressure_washing: "Pressure Washing",
  lawn_care: "Lawn Care / Maintenance",
  landscaping: "Landscaping / Installation"
};

function manifestServicesToContractorServices(slugs: string[]): string[] {
  return slugs.map((s) => SERVICE_TYPE_MAP[s] ?? s);
}

function defaultAnswersForLead(lead: LeadManifest): ServiceQuestionAnswers {
  const desc = lead.description.toLowerCase();
  const serviceType = SERVICE_TYPE_MAP[lead.service_category];

  if (serviceType === "Pressure Washing") {
    const targets: string[] = [];
    if (/drive(?:way)?|drive way|parking/.test(desc)) targets.push("Driveway");
    if (/patio|deck|pool deck|porch/.test(desc)) targets.push("Patio or porch");
    if (/(walkway|walk|side walk|sidewalk|brick walk)/.test(desc)) targets.push("Patio or porch");
    if (/house|stucco|exterior wall|wall|courtyard/.test(desc)) targets.push("House exterior");
    if (/fence/.test(desc)) targets.push("Fence");
    if (targets.length === 0) targets.push("Driveway");

    // Heuristic size — mostly medium for these LA homes
    const size =
      /(thorough|larger property|pool deck|across the property|whole|entire)/.test(desc)
        ? "Large area (~1,500-3,000 sq ft)"
        : "Medium area (~500-1,500 sq ft)";

    const condition = /(oil stain|paint splatter|grimy|moss|deep stain|heavy|algae)/.test(desc)
      ? /(oil stain|deep stain|rust|paint splatter)/.test(desc)
        ? "Oil, rust, or deep stains"
        : "Heavy staining or moss"
      : "Moderate buildup";

    const access = /(hill|hillside|slope|hard|difficult|tight)/.test(desc)
      ? "Some obstacles"
      : "Easy access";

    return {
      pressure_washing_target: Array.from(new Set(targets)),
      pressure_washing_size: size,
      pressure_washing_condition: condition,
      pressure_washing_access: access
    };
  }

  if (serviceType === "Lawn Care / Maintenance") {
    const workType = /(weekly|recurring|ongoing)/.test(desc) ? "Mowing and edging" : "Mowing and edging";
    const condition = /(dead patch|overgrown|weeds|rough)/.test(desc)
      ? /(very|thick|completely)/.test(desc)
        ? "Very overgrown"
        : "Slightly overgrown"
      : "Well-maintained";
    const propertyType = /(front and back|both)/.test(desc)
      ? "Front and backyard"
      : /(back yard|backyard|back lawn)/.test(desc)
        ? "Backyard only"
        : /(front yard|front lawn)/.test(desc)
          ? "Front yard only"
          : "Front and backyard";
    const areaSize = /(long|large|big|corner lot)/.test(desc)
      ? "Large yard (~5,000-10,000 sq ft)"
      : "Medium yard (~2,000-5,000 sq ft)";
    return {
      lawn_work_type: workType,
      lawn_area_size: areaSize,
      lawn_condition: condition,
      lawn_property_type: propertyType
    };
  }

  if (serviceType === "Landscaping / Installation") {
    return {
      landscape_work_type: ["Rock or mulch installation", "New plants or garden beds"],
      landscape_area_size: "One side of yard (~500-1,500 sq ft)",
      landscape_job_type: "Refresh existing landscaping",
      landscape_materials: ["Mostly mulch or rock"],
      landscape_access: /(hill|hillside|hard|difficult)/.test(desc) ? "Somewhat difficult" : "Easy"
    };
  }

  return {};
}

// ---------- arg parsing ----------

function parseArgs() {
  const args = process.argv.slice(2);
  let photosDir: string | undefined;
  let dryRun = false;
  let skipOrg = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--photos-dir") photosDir = args[++i];
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--skip-org") skipOrg = true;
  }
  return { photosDir, dryRun, skipOrg };
}

async function autodetectPhotosDir(): Promise<string> {
  const tempRoot = path.join(process.env.LOCALAPPDATA ?? "C:\\Users\\murdo\\AppData\\Local", "Temp");
  let entries: string[];
  try {
    entries = await readdir(tempRoot);
  } catch {
    throw new Error(`Cannot read temp dir ${tempRoot}. Pass --photos-dir explicitly.`);
  }
  const matches = entries.filter((e) => e.startsWith("snapquote-seed-"));
  if (matches.length === 0) {
    throw new Error(
      `No snapquote-seed-* dirs in ${tempRoot}. Unzip snapquote-seed-leads.zip there or pass --photos-dir.`
    );
  }
  matches.sort();
  const picked = path.join(tempRoot, matches[matches.length - 1], "seed-photos");
  try {
    await stat(picked);
  } catch {
    throw new Error(`Expected ${picked} to exist but it doesn't.`);
  }
  return picked;
}

// ---------- helpers ----------

function toE164UsPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return null;
}

function makePublicId(): string {
  return randomBytes(12).toString("base64url");
}

function randomPassword(): string {
  // Memorable but unique. Adjective + Noun + 4 digits + special char.
  const adjectives = ["Quick", "Bright", "Sunny", "Bold", "Smart", "Sharp", "Calm", "Crisp"];
  const nouns = ["Falcon", "River", "Meadow", "Canyon", "Harbor", "Ridge", "Orchard", "Compass"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  return `${adj}${noun}${digits}!`;
}

function isoNow(): string {
  return new Date().toISOString();
}

function isoOffset(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function extFromFilename(filename: string): { ext: string; contentType: string } {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".webp")) return { ext: "webp", contentType: "image/webp" };
  if (lower.endsWith(".png")) return { ext: "png", contentType: "image/png" };
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return { ext: "heic", contentType: "image/heic" };
  return { ext: "jpg", contentType: "image/jpeg" };
}

// Stagger 10 timestamps across a window. Returns ISO strings sorted oldest -> newest,
// with each timestamp in a unique minute so the lead list doesn't look batched.
function staggerTimestamps(count: number, windowHours: number): string[] {
  const now = Date.now();
  const windowMs = windowHours * 60 * 60 * 1000;
  const minuteSet = new Set<number>();
  const picks: number[] = [];
  while (picks.length < count) {
    const offset = Math.floor(Math.random() * windowMs);
    const candidate = now - offset;
    const minuteKey = Math.floor(candidate / (60 * 1000));
    if (minuteSet.has(minuteKey)) continue;
    minuteSet.add(minuteKey);
    picks.push(candidate);
  }
  picks.sort((a, b) => a - b);
  return picks.map((ms) => new Date(ms).toISOString());
}

// ---------- main ----------

async function main() {
  const { photosDir: photosArg, dryRun, skipOrg } = parseArgs();
  const photosDir = photosArg ?? (await autodetectPhotosDir());
  console.log(`[seed] photos dir: ${photosDir}`);
  console.log(`[seed] dry-run: ${dryRun}`);

  const manifestPath = path.join(photosDir, "LEADS.json");
  const manifestRaw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw) as Manifest;

  if (manifest.leads.length !== 10) {
    throw new Error(`Manifest has ${manifest.leads.length} leads; expected 10.`);
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // ---- step 1: auth user
  const password = randomPassword();
  console.log(`[seed] target owner email: ${manifest.org.owner_email}`);

  const existingUser = await findUserByEmail(supabase, manifest.org.owner_email);
  let userId: string;
  let actualPassword: string;
  if (existingUser) {
    userId = existingUser.id;
    actualPassword = "(existing — password not reset)";
    console.log(`[seed] auth user already exists: ${userId} (password unchanged)`);
  } else {
    if (dryRun) {
      userId = "DRY_RUN_USER_ID";
      actualPassword = password;
      console.log(`[seed] (dry-run) would create user ${manifest.org.owner_email} with password ${password}`);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: manifest.org.owner_email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: "Jose Martinez",
          is_demo: false
        }
      });
      if (error || !data.user) {
        throw new Error(`auth.admin.createUser failed: ${error?.message ?? "unknown"}`);
      }
      userId = data.user.id;
      actualPassword = password;
      // Print immediately. If anything below this point fails, the operator still
      // has the password and can resume / sign in without a separate reset step.
      console.log("");
      console.log("  +--------------------------------------------------------+");
      console.log(`  | OWNER PASSWORD: ${password.padEnd(38)} |`);
      console.log("  |   (printed early so a mid-run failure doesn't lose it) |");
      console.log("  +--------------------------------------------------------+");
      console.log("");
      console.log(`[seed] created auth user ${userId}`);
    }
  }

  // ---- step 2: org + contractor_profile + organization_members
  const orgSlug = "pacific-edge-property-care";
  const publicSlug = "pacific-edge-property-care";
  let orgId: string;

  if (skipOrg) {
    const { data: existing } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", orgSlug)
      .maybeSingle();
    if (!existing) throw new Error("--skip-org passed but no existing Pacific Edge org found.");
    orgId = existing.id as string;
    console.log(`[seed] reusing existing org ${orgId}`);
  } else if (dryRun) {
    orgId = "DRY_RUN_ORG_ID";
    console.log("[seed] (dry-run) would create org Pacific Edge Property Care");
  } else {
    // Reset window: 30 days out.
    const resetAt = isoOffset(30 * 24 * 60 * 60 * 1000);
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({
        name: manifest.org.name,
        slug: orgSlug,
        plan: manifest.org.plan,
        monthly_credits: manifest.org.credits,
        bonus_credits: 0,
        credits_reset_at: resetAt,
        onboarding_completed: true,
        last_active_at: isoNow()
      })
      .select("id")
      .single();
    if (orgError || !org) {
      throw new Error(`organizations insert failed: ${orgError?.message ?? "unknown"}`);
    }
    orgId = org.id as string;
    console.log(`[seed] created org ${orgId}`);

    const { error: memberError } = await supabase.from("organization_members").upsert(
      {
        org_id: orgId,
        user_id: userId,
        role: "OWNER"
      },
      { onConflict: "org_id,user_id" }
    );
    if (memberError) {
      throw new Error(`organization_members insert failed: ${memberError.message}`);
    }
    console.log("[seed] inserted organization_members row (OWNER)");

    // Contractor profile. notification_lead_email/sms intentionally false so seeding
    // doesn't fire 10 emails/pushes at jose@. The owner can toggle these in settings.
    const contractorServices = manifestServicesToContractorServices(manifest.org.services_offered);
    const { error: profileError } = await supabase.from("contractor_profile").upsert(
      {
        org_id: orgId,
        business_name: manifest.org.name,
        public_slug: publicSlug,
        phone: "+13105550100",
        email: manifest.org.owner_email,
        // Plausible LA business HQ — Pacific Palisades area, used for travel calc.
        business_address_full: "1230 W Olympic Blvd, Los Angeles, CA 90015",
        business_address_place_id: null,
        business_lat: 34.0407,
        business_lng: -118.2667,
        travel_pricing_disabled: false,
        services: contractorServices,
        notification_lead_sms: false,
        notification_lead_email: false,
        notification_accept_sms: false,
        notification_accept_email: false,
        email_verified: true,
        mobile_contractor: true,
        social_caption: `Need an estimate? ${manifest.org.name} makes it easy — fill out a quick form and we'll get back to you. https://snapquote.us/${publicSlug}`
      },
      { onConflict: "org_id" }
    );
    if (profileError) {
      throw new Error(`contractor_profile upsert failed: ${profileError.message}`);
    }
    console.log("[seed] inserted contractor_profile row");
  }

  // ---- step 3: upload photos + insert leads + trigger AI

  type ProcessedLead = {
    lead: LeadManifest;
    leadId: string;
    contractorServices: string[];
  };

  const processed: ProcessedLead[] = [];

  for (const lead of manifest.leads) {
    const tempLeadId = randomUUID();
    const folderPath = path.join(photosDir, lead.folder);
    const photoFiles = (await readdir(folderPath))
      .filter((f) => /\.(webp|jpe?g|png|heic|heif)$/i.test(f))
      .sort();

    if (photoFiles.length === 0) {
      console.warn(`[seed] lead-${lead.lead_number}: no photos in ${folderPath}`);
    }

    const photoRows: { storagePath: string; publicUrl: string }[] = [];

    for (const file of photoFiles) {
      const buf = await readFile(path.join(folderPath, file));
      const { ext, contentType } = extFromFilename(file);
      const storagePath = `${orgId}/${tempLeadId}/${randomUUID()}.${ext}`;
      if (dryRun) {
        photoRows.push({ storagePath, publicUrl: `dry-run://placeholder/${file}` });
        continue;
      }
      const { error: uploadError } = await supabase.storage
        .from("lead-photos")
        .upload(storagePath, buf, { contentType, upsert: false });
      if (uploadError) {
        throw new Error(
          `storage upload failed for ${storagePath} (lead-${lead.lead_number}): ${uploadError.message}`
        );
      }
      const { data: signed } = await supabase.storage
        .from("lead-photos")
        .createSignedUrl(storagePath, 60 * 60 * 24);
      const publicUrl = signed?.signedUrl ?? "";
      if (!publicUrl) {
        throw new Error(`createSignedUrl returned empty for ${storagePath}`);
      }
      photoRows.push({ storagePath, publicUrl });
    }

    // Customer dedup (org-scoped). Matches the public lead-submit handler's behavior.
    const e164Phone = toE164UsPhone(lead.customer_phone);
    if (!dryRun) {
      const { data: existingByEmail } = await supabase
        .from("customers")
        .select("id")
        .eq("org_id", orgId)
        .eq("email", lead.customer_email)
        .maybeSingle();
      if (!existingByEmail) {
        const { error: customerError } = await supabase.from("customers").insert({
          org_id: orgId,
          name: lead.customer_name,
          phone: e164Phone,
          email: lead.customer_email
        });
        if (customerError) {
          throw new Error(`customers insert failed for lead-${lead.lead_number}: ${customerError.message}`);
        }
      }
    }

    const serviceType = SERVICE_TYPE_MAP[lead.service_category];
    if (!serviceType) {
      throw new Error(`Unknown service_category in manifest: ${lead.service_category}`);
    }
    const answers = defaultAnswersForLead(lead);

    if (dryRun) {
      console.log(`[seed] (dry-run) would insert lead-${lead.lead_number} (id=${tempLeadId}) + ${photoRows.length} photos`);
    } else {
      const { error: leadError } = await supabase.from("leads").insert({
        id: tempLeadId,
        org_id: orgId,
        contractor_slug_snapshot: publicSlug,
        customer_name: lead.customer_name,
        customer_phone: e164Phone,
        customer_email: lead.customer_email,
        address_full: lead.address_full,
        address_place_id: null,
        lat: null,
        lng: null,
        services: [serviceType],
        service_question_answers: [{ service: serviceType, answers }],
        description: lead.description,
        status: "NEW",
        ai_status: "processing"
      });
      if (leadError) {
        throw new Error(`leads insert failed for lead-${lead.lead_number}: ${leadError.message}`);
      }

      if (photoRows.length > 0) {
        const rows = photoRows.map((p) => ({
          lead_id: tempLeadId,
          org_id: orgId,
          storage_path: p.storagePath,
          public_url: p.publicUrl
        }));
        const { error: photoErr } = await supabase
          .from("lead_photos")
          .upsert(rows, { onConflict: "lead_id,storage_path", ignoreDuplicates: true });
        if (photoErr) {
          throw new Error(`lead_photos insert failed for lead-${lead.lead_number}: ${photoErr.message}`);
        }
      }

      console.log(
        `[seed] lead-${lead.lead_number} inserted (id=${tempLeadId}, ${photoRows.length} photos)`
      );
    }

    processed.push({ lead, leadId: tempLeadId, contractorServices: [serviceType] });
  }

  // ---- step 4: trigger AI estimator for each lead, then wait

  if (!dryRun) {
    console.log("[seed] firing AI estimator for each lead (server-side via Edge Function)...");
    for (const p of processed) {
      const triggered = await triggerEstimator(p.leadId);
      if (!triggered.ok) {
        console.warn(
          `[seed] WARN: estimator trigger failed for lead ${p.leadId}: ${triggered.error}`
        );
      } else {
        console.log(`[seed] triggered estimator for lead ${p.leadId}`);
      }
      // Small jitter so the prod internal endpoint isn't slammed with 10 concurrent jobs.
      await sleep(800);
    }

    console.log("[seed] waiting for all 10 leads to reach a terminal AI state (ready/failed)...");
    await waitForEstimatorCompletion(
      supabase,
      processed.map((p) => p.leadId),
      8 * 60 * 1000
    );
  }

  // ---- step 5: unlock + DRAFT quote per lead
  if (!dryRun) {
    for (const p of processed) {
      // Re-read AI estimates for the quote price.
      const { data: leadRow, error: leadFetchErr } = await supabase
        .from("leads")
        .select("ai_estimate_low,ai_estimate_high,ai_suggested_price,ai_status,service_category")
        .eq("id", p.leadId)
        .eq("org_id", orgId)
        .single();
      if (leadFetchErr || !leadRow) {
        throw new Error(`leads fetch for unlock failed: ${leadFetchErr?.message ?? "unknown"}`);
      }
      const aiLow = Number(leadRow.ai_estimate_low ?? 0);
      const aiHigh = Number(leadRow.ai_estimate_high ?? 0);
      const aiSuggested = Number(leadRow.ai_suggested_price ?? 0);
      const midpoint = Math.round((aiLow + aiHigh) / 2 / 5) * 5;
      const price = midpoint || aiSuggested || 0;

      const { error: unlockErr } = await supabase.from("lead_unlocks").insert({
        org_id: orgId,
        lead_id: p.leadId
      });
      if (unlockErr && unlockErr.code !== "23505") {
        throw new Error(`lead_unlocks insert failed for ${p.leadId}: ${unlockErr.message}`);
      }

      const { error: quoteErr } = await supabase.from("quotes").insert({
        org_id: orgId,
        lead_id: p.leadId,
        public_id: makePublicId(),
        price,
        estimated_price_low: aiLow || null,
        estimated_price_high: aiHigh || null,
        message: DEFAULT_ESTIMATE_SMS_TEMPLATE,
        status: "DRAFT",
        sent_at: null
      });
      if (quoteErr) {
        throw new Error(`quotes insert failed for ${p.leadId}: ${quoteErr.message}`);
      }

      console.log(
        `[seed] unlocked + DRAFT-quoted lead ${p.leadId} (price=${price}, low=${aiLow}, high=${aiHigh}, ai_status=${leadRow.ai_status}, service_category=${leadRow.service_category})`
      );
    }
  }

  // ---- step 6: stagger submitted_at + ai_generated_at
  if (!dryRun) {
    const stagger = staggerTimestamps(processed.length, 36);
    for (let i = 0; i < processed.length; i++) {
      const p = processed[i];
      const submittedAt = stagger[i];
      // Realistic AI completion lag: 30-180 seconds after submission.
      const aiLagSeconds = 30 + Math.floor(Math.random() * 150);
      const aiGeneratedAt = new Date(
        new Date(submittedAt).getTime() + aiLagSeconds * 1000
      ).toISOString();

      const { error: updErr } = await supabase
        .from("leads")
        .update({
          submitted_at: submittedAt,
          ai_generated_at: aiGeneratedAt
        })
        .eq("id", p.leadId)
        .eq("org_id", orgId);
      if (updErr) {
        throw new Error(`leads stagger update failed for ${p.leadId}: ${updErr.message}`);
      }
    }
    console.log("[seed] staggered submitted_at + ai_generated_at across the past 36h");
  }

  // ---- step 7: ensure credits = 100
  if (!dryRun) {
    const { error: creditsErr } = await supabase
      .from("organizations")
      .update({ monthly_credits: 100, bonus_credits: 0 })
      .eq("id", orgId);
    if (creditsErr) {
      throw new Error(`organizations credits top-up failed: ${creditsErr.message}`);
    }
    console.log("[seed] credit balance ensured: monthly_credits=100, bonus_credits=0");
  }

  // ---- final report
  console.log("");
  console.log("==================== SEED COMPLETE ====================");
  console.log(`Org ID:        ${orgId}`);
  console.log(`Org name:      ${manifest.org.name}`);
  console.log(`Org slug:      ${orgSlug}`);
  console.log(`Public slug:   ${publicSlug}`);
  console.log(`Owner email:   ${manifest.org.owner_email}`);
  console.log(`Owner pass:    ${actualPassword}`);
  console.log(`Owner user id: ${userId}`);
  console.log("");
  console.log("Leads:");
  if (!dryRun) {
    const { data: finalLeads } = await supabase
      .from("leads")
      .select("id,services,service_category,ai_status,ai_estimate_low,ai_estimate_high,submitted_at")
      .eq("org_id", orgId)
      .order("submitted_at", { ascending: false });
    for (const l of finalLeads ?? []) {
      console.log(
        `  - ${l.id} | ${(l.services as string[])?.join(",")} | category=${l.service_category} | ai=${l.ai_status} low=${l.ai_estimate_low} high=${l.ai_estimate_high} | submitted_at=${l.submitted_at}`
      );
    }
  } else {
    for (const p of processed) {
      console.log(`  - (dry) ${p.leadId} | ${p.contractorServices.join(",")}`);
    }
  }
  console.log("=======================================================");
}

// ---------- helpers (auth + estimator trigger + wait) ----------

async function findUserByEmail(supabase: SupabaseClient, email: string) {
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) return null;
    page++;
  }
}

async function triggerEstimator(leadId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  // Posts directly to the internal estimator endpoint on prod Vercel, skipping
  // the Supabase Edge Function indirection. The same AI pipeline runs server-side
  // either way; the Edge Function is just a fire-and-forget shim used by the
  // public /api/public/lead-submit handler so its after() block can return early.
  // Local sb_secret_-format service-role keys fail the Edge Function's JWT validator,
  // so the script targets the internal endpoint directly with INTERNAL_API_SECRET.
  const base = APP_URL.replace(/\/$/, "");
  const url = `${base}/api/internal/run-estimator`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": INTERNAL_API_SECRET!
      },
      body: JSON.stringify({ leadId })
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `${res.status}: ${detail.slice(0, 400)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function waitForEstimatorCompletion(
  supabase: SupabaseClient,
  leadIds: string[],
  timeoutMs: number
): Promise<void> {
  const start = Date.now();
  const pending = new Set(leadIds);
  while (pending.size > 0) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `Timed out waiting for AI: still pending ${[...pending].join(", ")}`
      );
    }
    const ids = [...pending];
    const { data, error } = await supabase
      .from("leads")
      .select("id,ai_status")
      .in("id", ids);
    if (error) throw new Error(`leads poll failed: ${error.message}`);
    for (const row of data ?? []) {
      const status = row.ai_status as string;
      if (status === "ready" || status === "failed") {
        pending.delete(row.id as string);
        console.log(`[seed] lead ${row.id} -> ai_status=${status} (remaining: ${pending.size})`);
      }
    }
    if (pending.size > 0) await sleep(5000);
  }
}

// Mirrored from lib/quote-template.ts so the script can stay framework-free
// (avoids importing server-only modules that pull in next/sentry).
const DEFAULT_ESTIMATE_SMS_TEMPLATE = `Hi {{customer_name}},
Here is your estimate from {{company_name}}.
View your estimate:
{{estimate_link}}
Questions? Call or email {{contractor_phone}} {{contractor_email}}

Reply STOP to opt out.`;

// ---------- entry ----------

main().catch((err) => {
  console.error("[seed] FATAL:", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
