import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomersTable, type CustomerRow } from "@/components/CustomersTable";
import { requireAuth } from "@/lib/auth/requireAuth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const PAGE_SIZE = 25;

type Props = {
  searchParams: Promise<{ page?: string }>;
};

type UnlockedLeadRow = {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  submitted_at: string;
  lead_unlocks: Array<{ lead_id: string }>;
};

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits || null;
}

function normalizeEmail(email: string | null): string | null {
  return email?.trim().toLowerCase() || null;
}

export default async function CustomersPage({ searchParams }: Props) {
  const params = await searchParams;
  const auth = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const { data: leads } = await supabase
    .from("leads")
    .select(
      "id,customer_name,customer_phone,customer_email,submitted_at,lead_unlocks!inner(lead_id)"
    )
    .eq("org_id", auth.orgId)
    .eq("lead_unlocks.org_id", auth.orgId)
    .order("submitted_at", { ascending: false });

  const groups: Array<{
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    created_at: string;
  }> = [];

  for (const lead of ((leads ?? []) as unknown as UnlockedLeadRow[])) {
    if (!lead.lead_unlocks?.length) continue;

    const normalizedPhone = normalizePhone(lead.customer_phone);
    const normalizedEmail = normalizeEmail(lead.customer_email);
    const existingGroup = groups.find(
      (group) =>
        (normalizedPhone && normalizePhone(group.phone) === normalizedPhone) ||
        (normalizedEmail && normalizeEmail(group.email) === normalizedEmail)
    );

    if (!existingGroup) {
      groups.push({
        id: lead.id,
        name: lead.customer_name?.trim() || "Unknown customer",
        phone: lead.customer_phone,
        email: lead.customer_email,
        created_at: lead.submitted_at
      });
      continue;
    }

    const leadSubmittedAt = new Date(lead.submitted_at).getTime();
    const currentSubmittedAt = new Date(existingGroup.created_at).getTime();

    if (leadSubmittedAt > currentSubmittedAt) {
      existingGroup.id = lead.id;
      existingGroup.name = lead.customer_name?.trim() || existingGroup.name;
      existingGroup.created_at = lead.submitted_at;
    }

    if (!existingGroup.phone && lead.customer_phone) {
      existingGroup.phone = lead.customer_phone;
    }

    if (!existingGroup.email && lead.customer_email) {
      existingGroup.email = lead.customer_email;
    }
  }

  const allCustomers = groups.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const totalCustomers = allCustomers.length;
  const totalPages = Math.max(1, Math.ceil(totalCustomers / PAGE_SIZE));
  const pageFrom = (currentPage - 1) * PAGE_SIZE;
  const customers = allCustomers.slice(pageFrom, pageFrom + PAGE_SIZE);

  return (
    <div className="space-y-6">
      <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-foreground">Customer contacts</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <CustomersTable
            customers={customers as CustomerRow[]}
            currentPage={currentPage}
            totalPages={totalPages}
          />
        </CardContent>
      </Card>
    </div>
  );
}
