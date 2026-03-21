import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerForApi } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";

const updateCaptionSchema = z.object({
  socialCaption: z.string().trim().min(1).max(5000)
});

export async function POST(request: Request) {
  const auth = await requireOwnerForApi();
  if (!auth.ok) return auth.response;

  try {
    const body = updateCaptionSchema.parse(await request.json());
    const admin = createAdminClient();

    const { error } = await admin
      .from("contractor_profile")
      .update({ social_caption: body.socialCaption })
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
