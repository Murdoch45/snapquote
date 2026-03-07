import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureUserHasOrganization } from "@/lib/onboarding";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const schema = z.object({
  businessName: z.string().min(2).max(120),
  phone: z.string().max(40).optional()
});

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = schema.parse(await request.json());
    const result = await ensureUserHasOrganization({
      userId: user.id,
      email: user.email,
      businessName: body.businessName,
      phone: body.phone
    });

    return NextResponse.json({ ok: true, orgId: result.orgId, slug: result.slug });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Onboarding failed." },
      { status: 400 }
    );
  }
}
