"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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

export function CustomersTable({
  customers,
  currentPage,
  totalPages
}: {
  customers: CustomerRow[];
  currentPage: number;
  totalPages: number;
}) {
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
        className="text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
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
        className="text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
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
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by first name"
            className="h-11 rounded-[8px] border border-border bg-card px-[14px] pl-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Start typing a customer&apos;s first name to filter the list.
        </p>
      </div>

      {filteredCustomers.length > 0 ? (
        <>
          <div className="space-y-3 md:hidden">
            {filteredCustomers.map((customer) => (
              <div
                key={customer.id}
                className="rounded-[14px] border border-border bg-card p-4 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]"
              >
                <p className="text-base font-semibold text-foreground">{customer.name}</p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
                      Phone
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{renderPhone(customer.phone)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
                      Email
                    </p>
                    <p className="mt-1 break-all text-sm text-muted-foreground">
                      {renderEmail(customer.email)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
                      Added
                    </p>
                    <p className="mt-1 text-sm text-foreground">
                      {new Date(customer.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block">
            <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border bg-muted hover:bg-muted">
                    <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground">
                      Name
                    </TableHead>
                    <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground">
                      Phone
                    </TableHead>
                    <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground">
                      Email
                    </TableHead>
                    <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground">
                      Added
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => (
                    <TableRow
                      key={customer.id}
                      className="border-b border-border transition-colors hover:bg-muted"
                    >
                      <TableCell className="px-5 py-4 text-sm font-semibold text-foreground">
                        {customer.name}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-sm text-muted-foreground">
                        {renderPhone(customer.phone)}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-sm text-muted-foreground">
                        {renderEmail(customer.email)}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-sm text-muted-foreground">
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
        <div className="rounded-[14px] border border-border bg-card px-5 py-6 text-center text-sm text-muted-foreground shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
          {query.trim() ? "No customers match that first name." : "No customers yet."}
        </div>
      )}

      {customers.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <p>
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            {currentPage > 1 ? (
              <Link
                href={`/app/customers?page=${currentPage - 1}`}
                className="rounded-[10px] border border-border px-4 py-2 font-medium text-foreground transition-colors hover:bg-muted"
              >
                Previous
              </Link>
            ) : (
              <span className="rounded-[10px] border border-border px-4 py-2 font-medium text-muted-foreground/70">
                Previous
              </span>
            )}
            {currentPage < totalPages ? (
              <Link
                href={`/app/customers?page=${currentPage + 1}`}
                className="rounded-[10px] border border-primary bg-primary px-4 py-2 font-medium text-white transition-colors hover:bg-primary/90"
              >
                Next
              </Link>
            ) : (
              <span className="rounded-[10px] border border-border px-4 py-2 font-medium text-muted-foreground/70">
                Next
              </span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
