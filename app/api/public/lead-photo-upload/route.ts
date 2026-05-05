import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { rateLimit } from "@/lib/rateLimit";
import { createAdminClient } from "@/lib/supabase/admin";
import { leadPhotoUploadSchema } from "@/lib/validations";

export const runtime = "nodejs";
// 25s budget — well above what a single ~10MB photo upload to Supabase
// Storage should take, but enough headroom that a slow connection or a
// transient retry doesn't get killed mid-flight. Each photo gets its
// own request from the client, so they run in parallel within the
// browser's connection limit.
export const maxDuration = 25;

const ONE_HOUR_MS = 60 * 60 * 1000;

// Per-IP cap on photo uploads. A typical customer adds 2-6 photos and
// might retry once or twice; 80/hour leaves comfortable headroom while
// limiting an attacker's ability to mass-fill the lead-photos bucket
// with the public endpoint.
const PHOTO_UPLOAD_RATE_LIMIT = 80;

const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10MB hard cap per photo
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp"
]);

const PHOTO_UPLOAD_MAX_ATTEMPTS = 3;
const PHOTO_UPLOAD_RETRY_BASE_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extensionFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic" || mime === "image/heif") return "heic";
  return "jpg";
}

/**
 * Public per-photo upload endpoint used by the customer-facing lead form.
 *
 * Flow:
 *   1. Client picks a photo, immediately POSTs it here with the
 *      contractorSlug + tempLeadId (a v4 UUID generated at form mount).
 *   2. We validate, upload to Supabase Storage at
 *      `${orgId}/${tempLeadId}/${randomShort}.${ext}`.
 *   3. If a `leads` row with `id = tempLeadId AND org_id = orgId`
 *      already exists (the customer hit submit before this upload
 *      finished, then we beat the lead-submit's photo insert here, OR
 *      the upload completed AFTER lead-submit ran), we insert the
 *      `lead_photos` row directly so the photo attaches without a
 *      follow-up call. Idempotent thanks to the
 *      `lead_photos_lead_storage_path_unique` constraint added in
 *      migration 0066.
 *   4. If the lead row doesn't exist yet, we just return the
 *      `storagePath` + `publicUrl` and the client passes them along when
 *      it eventually calls `/api/public/lead-submit`.
 *
 * Trust model:
 *   - No auth, no Turnstile (gating uploads on Turnstile would defeat
 *     the upload-as-picked UX). Rate limit by IP only.
 *   - Strict file size + MIME validation.
 *   - tempLeadId must be a v4 UUID — caller can't supply arbitrary
 *     paths; the storage prefix is always `${orgId}/${tempLeadId}/`.
 */
export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!rateLimit(`lead-photo-upload:${ip}`, PHOTO_UPLOAD_RATE_LIMIT, ONE_HOUR_MS)) {
      return NextResponse.json(
        { error: "Too many uploads. Please try again later." },
        { status: 429 }
      );
    }

    const formData = await request.formData();
    const photo = formData.get("photo");
    if (!(photo instanceof File)) {
      return NextResponse.json({ error: "Missing photo file." }, { status: 400 });
    }

    const parsedFields = leadPhotoUploadSchema.safeParse({
      contractorSlug: String(formData.get("contractorSlug") ?? ""),
      tempLeadId: String(formData.get("tempLeadId") ?? "")
    });
    if (!parsedFields.success) {
      return NextResponse.json(
        { error: parsedFields.error.issues[0]?.message ?? "Invalid upload request." },
        { status: 400 }
      );
    }
    const { contractorSlug, tempLeadId } = parsedFields.data;

    if (photo.size === 0) {
      return NextResponse.json({ error: "Empty photo file." }, { status: 400 });
    }
    if (photo.size > MAX_PHOTO_BYTES) {
      return NextResponse.json(
        { error: "Photo exceeds the 10MB size limit." },
        { status: 413 }
      );
    }
    const mime = (photo.type || "").toLowerCase();
    if (mime && !ALLOWED_MIME_TYPES.has(mime)) {
      return NextResponse.json(
        { error: "Unsupported photo format." },
        { status: 415 }
      );
    }

    const admin = createAdminClient();

    // Resolve the contractor slug → org_id. Generic 400 (rather than
    // 404) when the slug is unknown so this endpoint doesn't become an
    // oracle for slug existence.
    const { data: contractor, error: contractorError } = await admin
      .from("contractor_profile")
      .select("org_id")
      .eq("public_slug", contractorSlug)
      .maybeSingle();
    if (contractorError) {
      throw contractorError;
    }
    if (!contractor) {
      return NextResponse.json(
        { error: "We couldn't find that contractor. Please check the link and try again." },
        { status: 400 }
      );
    }
    const orgId = contractor.org_id as string;

    // Buffer the file once — repeated arrayBuffer() calls on a File from
    // multipart can fail on some HEIC payloads.
    let arrayBuffer: ArrayBuffer;
    try {
      arrayBuffer = await photo.arrayBuffer();
    } catch (error) {
      Sentry.captureException(error, {
        tags: { area: "lead-photo-upload", stage: "photo-buffer" },
        extra: { orgId, tempLeadId, photoType: photo.type, photoSize: photo.size }
      });
      return NextResponse.json(
        { error: "Could not read uploaded photo." },
        { status: 400 }
      );
    }

    const ext = extensionFromMime(mime || "image/jpeg");
    const storagePath = `${orgId}/${tempLeadId}/${randomUUID()}.${ext}`;

    let lastUploadError: { message?: string } | null = null;
    let uploadOk = false;

    for (let attempt = 1; attempt <= PHOTO_UPLOAD_MAX_ATTEMPTS; attempt++) {
      const { error: uploadError } = await admin.storage
        .from("lead-photos")
        .upload(storagePath, arrayBuffer, {
          contentType: mime || "image/jpeg",
          upsert: false
        });
      if (!uploadError) {
        uploadOk = true;
        break;
      }
      lastUploadError = uploadError;
      const isLastAttempt = attempt === PHOTO_UPLOAD_MAX_ATTEMPTS;
      if (isLastAttempt) {
        Sentry.captureException(uploadError, {
          tags: { area: "lead-photo-upload", stage: "storage-upload", final: "true" },
          extra: { orgId, tempLeadId, storagePath, photoSize: photo.size, attempts: attempt }
        });
        break;
      }
      await sleep(PHOTO_UPLOAD_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }

    if (!uploadOk) {
      return NextResponse.json(
        { error: lastUploadError?.message ?? "Photo upload failed. Please try again." },
        { status: 502 }
      );
    }

    // 24h signed URL — long enough to live until AI ingest reads the
    // photo, even if the lead is created several minutes after upload.
    const { data: signed } = await admin.storage
      .from("lead-photos")
      .createSignedUrl(storagePath, 60 * 60 * 24);
    const publicUrl = signed?.signedUrl ?? "";

    if (!publicUrl) {
      Sentry.captureMessage("lead-photo-upload createSignedUrl returned empty url", {
        level: "warning",
        tags: { area: "lead-photo-upload", stage: "sign-url" },
        extra: { orgId, tempLeadId, storagePath }
      });
    }

    // If the lead row already exists (the customer submitted before
    // this upload finished), attach the photo directly. Otherwise the
    // client will pass storagePath + publicUrl to /api/public/lead-submit
    // when the customer hits submit, and the lead-submit insert covers
    // it. Either way we end up with one lead_photos row per upload — the
    // unique constraint catches the dual-write race.
    let attached = false;
    const { data: existingLead, error: leadLookupError } = await admin
      .from("leads")
      .select("id")
      .eq("id", tempLeadId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (leadLookupError) {
      console.warn("lead-photo-upload lead lookup failed:", leadLookupError);
    }
    if (existingLead) {
      const { error: photoInsertError } = await admin
        .from("lead_photos")
        .insert({
          lead_id: tempLeadId,
          org_id: orgId,
          storage_path: storagePath,
          public_url: publicUrl
        });
      if (photoInsertError && photoInsertError.code !== "23505") {
        // 23505 = unique_violation = lead-submit already inserted this
        // exact path (extremely tight race; the client could send the
        // same storagePath in lead-submit if it had already received a
        // response from us). Treat as soft success.
        Sentry.captureException(photoInsertError, {
          tags: { area: "lead-photo-upload", stage: "photo-row-attach" },
          extra: { orgId, tempLeadId, storagePath }
        });
      } else {
        attached = true;
      }
    }

    return NextResponse.json({
      success: true,
      storagePath,
      publicUrl,
      attached
    });
  } catch (error) {
    console.error("lead-photo-upload failed:", error);
    Sentry.captureException(error, {
      tags: { area: "lead-photo-upload", stage: "top-level" }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Photo upload failed." },
      { status: 500 }
    );
  }
}
