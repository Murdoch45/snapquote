import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !serviceRole) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  const { data: org } = await supabase
    .from("organizations")
    .insert({
      name: "Greenline Outdoor",
      slug: "greenline-outdoor",
      plan: "TEAM"
    })
    .select("id")
    .single();

  if (!org) throw new Error("Org creation failed.");

  await supabase.from("contractor_profile").insert({
    org_id: org.id,
    business_name: "Greenline Outdoor",
    public_slug: `greenline-${Math.floor(Math.random() * 9000 + 1000)}`,
    services: ["Lawn Care / Maintenance", "Landscaping / Installation"]
  });

  const { data: customer } = await supabase
    .from("customers")
    .insert({
      org_id: org.id,
      name: "Alex Parker",
      phone: "+15555550123",
      email: "alex@example.com"
    })
    .select("id")
    .single();

  const { data: lead } = await supabase
    .from("leads")
    .insert({
      org_id: org.id,
      contractor_slug_snapshot: "greenline-demo",
      customer_name: "Alex Parker",
      customer_phone: "+15555550123",
      customer_email: "alex@example.com",
      address_full: "123 Main St, Austin, TX",
      services: ["Lawn Care / Maintenance"],
      description: "Front yard cleanup and monthly maintenance.",
      ai_job_summary: "Medium-size front yard cleanup and recurring lawn care.",
      ai_estimate_low: 300,
      ai_estimate_high: 1200,
      ai_suggested_price: 650,
      ai_draft_message:
        "Thanks for reaching out. Based on the details, a fair estimate is $650 with a range of $300-$1,200 pending final walkthrough.",
      ai_generated_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (lead) {
    await supabase.from("quotes").insert({
      org_id: org.id,
      lead_id: lead.id,
      public_id: `demo-${Math.random().toString(36).slice(2, 9)}`,
      price: 700,
      message:
        "Thanks for contacting us. We can complete the requested work for $700 and schedule this week.",
      status: "SENT"
    });
  }

  await supabase.from("org_usage_monthly").insert({
    org_id: org.id,
    month: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .slice(0, 10),
    quotes_sent_count: 1,
    grace_used: false
  });

}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
