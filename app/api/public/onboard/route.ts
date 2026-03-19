import { NextResponse } from "next/server";
import { z } from "zod";
import { SERVICE_OPTIONS } from "@/lib/services";
import { ensureUserHasOrganization } from "@/lib/onboarding";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const schema = z.object({
  businessName: z.string().min(2).max(120),
  services: z.array(z.enum(SERVICE_OPTIONS)).min(1),
  mobileContractor: z.boolean(),
  formattedAddress: z.string().trim().min(5).max(240).nullable(),
  placeId: z.string().trim().min(1).max(255).nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable()
}).superRefine((data, ctx) => {
  if (data.mobileContractor) return;

  if (!data.formattedAddress || !data.placeId || data.latitude === null || data.longitude === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select a valid business address."
    });
  }
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
      services: body.services,
      mobileContractor: body.mobileContractor,
      formattedAddress: body.formattedAddress,
      placeId: body.placeId,
      latitude: body.latitude,
      longitude: body.longitude
    });

    return NextResponse.json({ ok: true, orgId: result.orgId, slug: result.slug });
  } catch (error) {
    console.error("ONBOARDING ERROR:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Onboarding failed." },
      { status: error instanceof z.ZodError ? 400 : 500 }
    );
  }
}
