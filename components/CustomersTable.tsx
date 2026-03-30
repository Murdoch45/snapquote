"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

export type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
};

function getFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

export function CustomersTable({ customers }: { customers: CustomerRow[] }) {
  const [query, setQuery] = useState("");

  const filteredCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return customers;

    return customers.filter((customer) =>
      getFirstName(customer.name).toLowerCase().startsWith(normalizedQuery)
    );
  }, [customers, query]);

  const renderPhone = (phone: string | null) =>
    phone ? (
      <a
        href={`tel:${phone}`}
        className="text-[#6B7280] underline-offset-4 transition-colors hover:text-[#2563EB] hover:underline"
      >
        {phone}
      </a>
    ) : (
      "-"
    );

  const renderEmail = (email: string | null) =>
    email ? (
      <a
        href={`mailto:${email}`}
        className="text-[#6B7280] underline-offset-4 transition-colors hover:text-[#2563EB] hover:underline"
      >
        {email}
      </a>
    ) : (
      "-"
    );

  return (
    <div className="space-y-4">
      <div className="max-w-sm space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by first name"
            className="h-11 rounded-[8px] border border-[#E5E7EB] bg-white px-[14px] pl-9 text-sm text-[#111827] placeholder:text-[#6B7280] focus-visible:ring-[#2563EB]"
          />
        </div>
        <p className="text-xs text-[#6B7280]">
          Start typing a customer&apos;s first name to filter the list.
        </p>
      </div>

      {filteredCustomers.length > 0 ? (
        <>
          <div className="space-y-3 md:hidden">
            {filteredCustomers.map((customer) => (
              <div
                key={customer.id}
                className="rounded-[14px] border border-[#E5E7EB] bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]"
              >
                <p className="text-base font-semibold text-[#111827]">{customer.name}</p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#6B7280]">
                      Phone
                    </p>
                    <p className="mt-1 text-sm text-[#6B7280]">{renderPhone(customer.phone)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#6B7280]">
                      Email
                    </p>
                    <p className="mt-1 break-all text-sm text-[#6B7280]">
                      {renderEmail(customer.email)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#6B7280]">
                      Added
                    </p>
                    <p className="mt-1 text-sm text-[#111827]">
                      {new Date(customer.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block">
            <div className="overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-[#E5E7EB] bg-[#F8F9FC] hover:bg-[#F8F9FC]">
                    <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">
                      Name
                    </TableHead>
                    <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">
                      Phone
                    </TableHead>
                    <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">
                      Email
                    </TableHead>
                    <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">
                      Added
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => (
                    <TableRow
                      key={customer.id}
                      className="border-b border-[#E5E7EB] transition-colors hover:bg-[#F9FAFB]"
                    >
                      <TableCell className="px-5 py-4 text-sm font-semibold text-[#111827]">
                        {customer.name}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-sm text-[#6B7280]">
                        {renderPhone(customer.phone)}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-sm text-[#6B7280]">
                        {renderEmail(customer.email)}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-sm text-[#6B7280]">
                        {new Date(customer.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-[14px] border border-[#E5E7EB] bg-white px-5 py-6 text-center text-sm text-[#6B7280] shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
          {query.trim() ? "No customers match that first name." : "No customers yet."}
        </div>
      )}
    </div>
  );
}
