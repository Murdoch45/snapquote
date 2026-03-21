"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Member = {
  user_id: string;
  role: "OWNER" | "MEMBER";
  created_at: string;
  user_email?: string | null;
};

type Invite = {
  id: string;
  email: string;
  role: "MEMBER";
  status: "PENDING" | "ACCEPTED" | "REVOKED";
  created_at: string;
};

type TeamManagerProps = {
  isOwner: boolean;
  members: Member[];
  invites: Invite[];
};

function formatRole(role: Member["role"] | Invite["role"]): string {
  return role === "OWNER" ? "Admin" : "User";
}

function getInitials(value: string): string {
  const parts = value
    .replace(/@.*$/, "")
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);

  if (parts.length === 0) return "SQ";

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function TeamManager({ isOwner, members, invites }: TeamManagerProps) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const invite = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/app/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Invite failed.");
      toast.success("Invite sent.");
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invite failed.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (memberUserId: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/app/team/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberUserId })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Remove failed.");
      toast.success("Member removed.");
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Remove failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {isOwner && (
        <div className="flex flex-col gap-3 rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)] sm:flex-row">
          <Input
            type="email"
            placeholder="member@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 rounded-[8px] border-[#E5E7EB] bg-white px-[14px] text-sm text-[#111827] placeholder:text-[#6B7280] focus-visible:ring-[#2563EB]"
          />
          <Button disabled={busy || !email} onClick={invite}>
            Invite member
          </Button>
        </div>
      )}
      <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 className="mb-4 text-base font-semibold text-[#111827]">Members</h2>
        <Table>
          <TableHeader>
            <TableRow className="border-b border-[#E5E7EB] bg-[#F8F9FC] hover:bg-[#F8F9FC]">
              <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">
                Member
              </TableHead>
              <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">
                Role
              </TableHead>
              <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">
                Joined
              </TableHead>
              <TableHead className="h-auto px-5 py-3" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow
                key={member.user_id}
                className="border-b border-[#E5E7EB] transition-colors hover:bg-[#F9FAFB]"
              >
                <TableCell className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EFF6FF] text-sm font-bold text-[#2563EB]">
                      {getInitials(member.user_email ?? member.user_id)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#111827]">
                        {member.user_email?.split("@")[0] ?? "Team member"}
                      </p>
                      {member.user_email ? (
                        <a
                          href={`mailto:${member.user_email}`}
                          className="text-sm text-[#6B7280] transition-colors hover:text-[#2563EB] hover:underline"
                        >
                          {member.user_email}
                        </a>
                      ) : (
                        <p className="text-sm text-[#6B7280]">{member.user_id}</p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-5 py-4">
                  <span
                    className={
                      member.role === "OWNER"
                        ? "inline-flex rounded-full bg-[#EFF6FF] px-3 py-1 text-[12px] font-semibold text-[#2563EB]"
                        : "inline-flex rounded-full bg-[#F0FDF4] px-3 py-1 text-[12px] font-semibold text-[#16A34A]"
                    }
                  >
                    {formatRole(member.role)}
                  </span>
                </TableCell>
                <TableCell className="px-5 py-4 text-sm text-[#6B7280]">
                  {new Date(member.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="px-5 py-4 text-right">
                  {isOwner && member.role !== "OWNER" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-2 border-[#2563EB] bg-transparent text-[#2563EB] hover:bg-[#EFF6FF]"
                      onClick={() => remove(member.user_id)}
                    >
                      Remove
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 className="mb-4 text-base font-semibold text-[#111827]">Pending Invites</h2>
        {invites.length === 0 ? (
          <p className="text-sm text-[#6B7280]">No pending invites.</p>
        ) : (
          <ul className="space-y-3">
            {invites.map((inviteRow) => (
              <li
                key={inviteRow.id}
                className="flex flex-col gap-3 rounded-[12px] border border-[#E5E7EB] bg-[#F8F9FC] px-4 py-4 text-sm text-[#6B7280] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EFF6FF] text-sm font-bold text-[#2563EB]">
                    {getInitials(inviteRow.email)}
                  </div>
                  <div>
                    <a
                      href={`mailto:${inviteRow.email}`}
                      className="text-sm text-[#6B7280] transition-colors hover:text-[#2563EB] hover:underline"
                    >
                      {inviteRow.email}
                    </a>
                    <p className="mt-1 text-sm text-[#6B7280]">
                      {new Date(inviteRow.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-full bg-[#F0FDF4] px-3 py-1 text-[12px] font-semibold text-[#16A34A]">
                    {formatRole(inviteRow.role)}
                  </span>
                  <span className="inline-flex rounded-full bg-[#FFF7ED] px-3 py-1 text-[12px] font-semibold text-[#EA580C]">
                    Pending
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
