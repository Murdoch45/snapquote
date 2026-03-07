import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomersTable, type CustomerRow } from "@/components/CustomersTable";
import { requireAuth } from "@/lib/auth/requireAuth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function CustomersPage() {
  const auth = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: customers } = await supabase
    .from("customers")
    .select("*")
    .eq("org_id", auth.orgId)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">Customers</h1>
      <Card>
        <CardHeader>
          <CardTitle>Customer contacts</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomersTable customers={(customers ?? []) as CustomerRow[]} />
        </CardContent>
      </Card>
    </div>
  );
}
