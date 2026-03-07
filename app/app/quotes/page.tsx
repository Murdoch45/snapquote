import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { requireAuth } from "@/lib/auth/requireAuth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { toCurrency } from "@/lib/utils";

export default async function QuotesPage() {
  const auth = await requireAuth();
  const supabase = await createServerSupabaseClient();
  const { data: quotes } = await supabase
    .from("quotes")
    .select("id,public_id,price,status,sent_at,accepted_at,lead:leads(address_full,services)")
    .eq("org_id", auth.orgId)
    .order("sent_at", { ascending: false });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">Quotes</h1>
      <Card>
        <CardHeader>
          <CardTitle>Sent quotes</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Address</TableHead>
                <TableHead>Services</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(quotes ?? []).map((quote) => {
                const lead = Array.isArray(quote.lead) ? quote.lead[0] : quote.lead;
                return (
                  <TableRow key={quote.id}>
                    <TableCell>{lead?.address_full}</TableCell>
                    <TableCell>{(lead?.services as string[]).join(", ")}</TableCell>
                    <TableCell>{toCurrency(Number(quote.price))}</TableCell>
                    <TableCell>
                      <Badge variant={quote.status === "ACCEPTED" ? "secondary" : "muted"}>
                        {quote.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(quote.sent_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Link href={`/q/${quote.public_id}`} target="_blank">
                        Open public quote
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
