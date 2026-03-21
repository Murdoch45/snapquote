import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMemberForApi } from "@/lib/auth/requireRole";
import { unlockLead } from "@/lib/credits";

const unlockLeadSchema = z.object({
  leadId: z.string().uuid()
});

export async function POST(request: Request) {
  const auth = await requireMemberForApi();
  if (!auth.ok) return auth.response;

  try {
    const body = unlockLeadSchema.parse(await request.json());
    const result = await unlockLead(auth.orgId, body.leadId);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 402 });
    }

    return NextResponse.json({
      ok: true,
      alreadyUnlocked: result.alreadyUnlocked
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to unlock lead." },
      { status: 400 }
    );
  }
}
