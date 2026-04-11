import { NextResponse } from "next/server";
import { z } from "zod";
import { SERVICE_OPTIONS } from "@/lib/services";
import { EmailNotConfirmedError, ensureUserHasOrganization } from "@/lib/onboarding";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const schema = z
  .object({
    accessToken: z.string().trim().min(1).optional(),
    businessName: z.string().min(2).max(120),
    services: z.array(z.enum(SERVICE_OPTIONS)).min(1),
    mobileContractor: z.boolean(),
    formattedAddress: z.string().trim().min(5).max(240).nullable(),
    placeId: z.string().trim().min(1).max(255).nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable()
  })
  .superRefine((data, ctx) => {
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
    const body = schema.parse(await request.json());

    const accessToken =
      body.accessToken ||
      request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ||
      null;

    let resolvedUser: {
      id: string;
      email?: string | null;
      emailConfirmedAt: string | null;
    } | null = null;

    if (accessToken) {
      const admin = createAdminClient();
      const {
        data: { user }
      } = await admin.auth.getUser(accessToken);
      resolvedUser = user
        ? { id: user.id, email: user.email, emailConfirmedAt: user.email_confirmed_at ?? null }
        : null;
    }

    if (!resolvedUser) {
      const supabase = await createServerSupabaseClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      resolvedUser = user
        ? { id: user.id, email: user.email, emailConfirmedAt: user.email_confirmed_at ?? null }
        : null;
    }

    if (!resolvedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const result = await ensureUserHasOrganization({
      userId: resolvedUser.id,
      email: resolvedUser.email,
      emailConfirmedAt: resolvedUser.emailConfirmedAt,
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
    if (error instanceof EmailNotConfirmedError) {
      return NextResponse.json(
        { error: error.message, code: "EMAIL_NOT_CONFIRMED" },
        { status: 403 }
      );
    }
    console.error("ONBOARDING ERROR:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Onboarding failed." },
      { status: error instanceof z.ZodError ? 400 : 500 }
    );
  }
}
