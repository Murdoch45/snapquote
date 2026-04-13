"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Member = {
  user_id: string;
  role: "OWNER" | "MEMBER";
  created_at: string;
  user_email?: string | null;
};

type Invite = {
  id: string;
  email: string | null;
  role: "MEMBER";
  status: "PENDING" | "ACCEPTED" | "REVOKED";
  created_at: string;
  expires_at?: string | null;
  token?: string | null;
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
  const [busy, setBusy] = useState(false);

  const invite = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/app/team/invite-link", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Invite failed.");
      await navigator.clipboard.writeText(json.inviteUrl);
      toast.success("Invite link copied. Share it with your team member.");
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
        <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-card p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Invite a team member</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Generate a secure invite link that expires in 7 days.
            </p>
          </div>
          <Button disabled={busy} onClick={invite}>
            {busy ? "Copying..." : "Copy Invite Link"}
          </Button>
        </div>
      )}
      <div className="rounded-[14px] border border-border bg-card p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 className="mb-4 text-base font-semibold text-foreground">Members</h2>
        <div className="space-y-3 md:hidden">
          {members.map((member) => (
            <div
              key={member.user_id}
              className="rounded-[12px] border border-border bg-muted p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-bold text-primary">
                  {getInitials(member.user_email ?? member.user_id)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {member.user_email?.split("@")[0] ?? "Team member"}
                  </p>
                  {member.user_email ? (
                    <a
                      href={`mailto:${member.user_email}`}
                      className="break-all text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
                    >
                      {member.user_email}
                    </a>
                  ) : (
                    <p className="break-all text-sm text-muted-foreground">{member.user_id}</p>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
                    Role
                  </p>
                  <span
                    className={
                      member.role === "OWNER"
                        ? "mt-1 inline-flex rounded-full bg-accent px-3 py-1 text-[12px] font-semibold text-primary"
                        : "mt-1 inline-flex rounded-full bg-green-50 dark:bg-green-950/30 px-3 py-1 text-[12px] font-semibold text-green-600 dark:text-green-400"
                    }
                  >
                    {formatRole(member.role)}
                  </span>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
                    Joined
                  </p>
                  <p className="mt-1 text-sm text-foreground">
                    {new Date(member.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                {isOwner && member.role !== "OWNER" ? (
                  <Button
                    variant="outline"
                    className="h-11 w-full border-2 border-primary bg-transparent text-primary hover:bg-accent"
                    onClick={() => remove(member.user_id)}
                  >
                    Remove
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">Account owner</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border bg-muted hover:bg-muted">
                <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground">
                  Member
                </TableHead>
                <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground">
                  Role
                </TableHead>
                <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground">
                  Joined
                </TableHead>
                <TableHead className="h-auto px-5 py-3" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow
                  key={member.user_id}
                  className="border-b border-border transition-colors hover:bg-muted"
                >
                  <TableCell className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-bold text-primary">
                        {getInitials(member.user_email ?? member.user_id)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          {member.user_email?.split("@")[0] ?? "Team member"}
                        </p>
                        {member.user_email ? (
                          <a
                            href={`mailto:${member.user_email}`}
                            className="text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
                          >
                            {member.user_email}
                          </a>
                        ) : (
                          <p className="text-sm text-muted-foreground">{member.user_id}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-5 py-4">
                    <span
                      className={
                        member.role === "OWNER"
                          ? "inline-flex rounded-full bg-accent px-3 py-1 text-[12px] font-semibold text-primary"
                          : "inline-flex rounded-full bg-green-50 dark:bg-green-950/30 px-3 py-1 text-[12px] font-semibold text-green-600 dark:text-green-400"
                      }
                    >
                      {formatRole(member.role)}
                    </span>
                  </TableCell>
                  <TableCell className="px-5 py-4 text-sm text-muted-foreground">
                    {new Date(member.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="px-5 py-4 text-right">
                    {isOwner && member.role !== "OWNER" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-2 border-primary bg-transparent text-primary hover:bg-accent"
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
      </div>
      <div className="rounded-[14px] border border-border bg-card p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 className="mb-4 text-base font-semibold text-foreground">Pending Invites</h2>
        {invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending invites.</p>
        ) : (
          <ul className="space-y-3">
            {invites.map((inviteRow) => (
              <li
                key={inviteRow.id}
                className="flex flex-col gap-3 rounded-[12px] border border-border bg-muted px-4 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-bold text-primary">
                    {getInitials(inviteRow.email ?? "invite-link")}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {inviteRow.email ?? "Invite link ready"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {new Date(inviteRow.created_at).toLocaleDateString()}
                    </p>
                    {inviteRow.expires_at ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Expires {new Date(inviteRow.expires_at).toLocaleDateString()}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-full bg-green-50 dark:bg-green-950/30 px-3 py-1 text-[12px] font-semibold text-green-600 dark:text-green-400">
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
