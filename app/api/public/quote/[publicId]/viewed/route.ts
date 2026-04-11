import { NextResponse } from "next/server";
import { sendPushToOrg } from "@/lib/pushNotifications";
import { createAdminClient } from "@/lib/supabase/admin";

type Props = {
  params: Promise<{ publicId: string }>;
};

export async function POST(_request: Request, { params }: Props) {
  const { publicId } = await params;
  const admin = createAdminClient();

  const { data: quote } = await admin
    .from("quotes")
    .select("id,org_id,lead_id,status,viewed_at")
    .eq("public_id", publicId)
    .single();

  if (!quote) return NextResponse.json({ error: "Estimate not found." }, { status: 404 });
  if (quote.status === "ACCEPTED" || quote.status === "EXPIRED") {
    return NextResponse.json({ viewed: true, status: quote.status });
  }

  const now = new Date().toISOString();
  if (!quote.viewed_at) {
    await admin
      .from("quotes")
      .update({
        viewed_at: now,
        status: quote.status === "SENT" ? "VIEWED" : quote.status
      })
      .eq("id", quote.id);

    await admin.from("quote_events").insert({
      org_id: quote.org_id,
      quote_id: quote.id,
      event_type: "VIEWED"
    });

    // Fan out a push to every device in the org. Fires only on the
    // first view of this estimate (gated by !quote.viewed_at above).
    void sendPushToOrg(quote.org_id as string, {
      title: "Estimate Opened",
      body: "A customer is viewing your estimate.",
      data: { screen: "lead", id: quote.lead_id as string }
    });
  }

  return NextResponse.json({ viewed: true });
}
