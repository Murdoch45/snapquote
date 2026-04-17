import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMemberForApi } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Matches the phone/email shape used by leadSubmitSchema so the values the
// contractor can save here aren't stricter or looser than what the public
// form accepts. Empty strings come in as explicit nulls from the composer
// UI so the contractor can clear a field by saving blank.
const updateContactSchema = z.object({
  customerEmail: z
    .union([z.string().email(), z.null(), z.literal("").transform(() => null)])
    .optional()
    .transform((value) => value ?? null),
  customerPhone: z
    .union([
      z
        .string()
        .trim()
        .regex(/^[+\d().\-\s]{7,20}$/),
      z.null(),
      z.literal("").transform(() => null)
    ])
    .optional()
    .transform((value) => value ?? null)
});

type Props = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: Props) {
  const auth = await requireMemberForApi(request);
  if (!auth.ok) return auth.response;

  try {
    const { id: leadId } = await params;
    const body = updateContactSchema.parse(await request.json());

    const admin = createAdminClient();

    // Scope the update to the caller's org. RLS on the leads table would
    // enforce this too, but we're using the admin client to keep the
    // write on one connection pool with the rest of the quote flow; the
    // explicit .eq("org_id", …) guarantees no cross-org writes.
    const { data: updated, error } = await admin
      .from("leads")
      .update({
        customer_email: body.customerEmail,
        customer_phone: body.customerPhone
      })
      .eq("id", leadId)
      .eq("org_id", auth.orgId)
      .select("id,customer_email,customer_phone")
      .single();

    if (error || !updated) {
      return NextResponse.json(
        { error: error?.message ?? "Lead not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      customerEmail: (updated.customer_email as string | null) ?? null,
      customerPhone: (updated.customer_phone as string | null) ?? null
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update contact." },
      { status: 400 }
    );
  }
}
