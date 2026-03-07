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

  return (
    <div className="space-y-4">
      <div className="max-w-sm space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by first name"
            className="pl-9"
          />
        </div>
        <p className="text-xs text-gray-500">
          Start typing a customer&apos;s first name to filter the list.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Added</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredCustomers.length > 0 ? (
            filteredCustomers.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell>{customer.name}</TableCell>
                <TableCell>{customer.phone || "-"}</TableCell>
                <TableCell>{customer.email || "-"}</TableCell>
                <TableCell>{new Date(customer.created_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={4} className="py-6 text-center text-gray-500">
                No customers match that first name.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
