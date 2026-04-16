import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerForApi } from "@/lib/auth/requireRole";
import { SOCIAL_CAPTION_MAX_LENGTH } from "@/lib/socialCaption";
import { createAdminClient } from "@/lib/supabase/admin";

// Single authoritative endpoint for writing contractor_profile.social_caption.
// Used by both web (components/MyLinkPageClient.tsx) and mobile
// (lib/api/myLink.ts). The sibling /api/app/settings/patch no longer accepts
// social_caption — all caption writes must go through this route so there is
// one validation schema and one owner check.
//
// Accepts an explicit null to mean "clear the custom caption and fall back to
// the default template"; empty strings are normalised to null so the client
// doesn't need to care about the distinction.
const updateCaptionSchema = z.object({
  socialCaption: z
    .string()
    .trim()
    .max(SOCIAL_CAPTION_MAX_LENGTH)
    .nullable()
});

export async function POST(request: Request) {
  const auth = await requireOwnerForApi(request);
  if (!auth.ok) return auth.response;

  try {
    const body = updateCaptionSchema.parse(await request.json());
    const nextValue =
      body.socialCaption === null || body.socialCaption.length === 0
        ? null
        : body.socialCaption;

    const admin = createAdminClient();

    const { error } = await admin
      .from("contractor_profile")
      .update({ social_caption: nextValue })
      .eq("org_id", auth.orgId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save caption." },
      { status: 400 }
    );
  }
}
