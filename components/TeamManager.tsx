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
        <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row">
          <Input
            type="email"
            placeholder="member@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button disabled={busy || !email} onClick={invite}>
            Invite member
          </Button>
        </div>
      )}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Members</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.user_id}>
                <TableCell>{member.user_email || member.user_id}</TableCell>
                <TableCell>{member.role}</TableCell>
                <TableCell>{new Date(member.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  {isOwner && member.role !== "OWNER" && (
                    <Button variant="outline" size="sm" onClick={() => remove(member.user_id)}>
                      Remove
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Pending Invites</h2>
        {invites.length === 0 ? (
          <p className="text-sm text-gray-500">No pending invites.</p>
        ) : (
          <ul className="space-y-2 text-sm text-gray-700">
            {invites.map((inviteRow) => (
              <li key={inviteRow.id}>
                {inviteRow.email} - {new Date(inviteRow.created_at).toLocaleDateString()}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
