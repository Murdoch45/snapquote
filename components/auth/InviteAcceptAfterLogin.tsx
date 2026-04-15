"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type InviteAcceptAfterLoginProps = {
  token: string;
};

export function InviteAcceptAfterLogin({ token }: InviteAcceptAfterLoginProps) {
  const router = useRouter();
  const hasAttemptedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasAttemptedRef.current) {
      return;
    }

    hasAttemptedRef.current = true;

    void (async () => {
      const response = await fetch("/api/public/invite/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ token })
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (response.status === 401) {
        router.replace(`/login?invite_token=${encodeURIComponent(token)}`);
        return;
      }

      if (!response.ok) {
        setError(payload?.error || "We couldn't finish joining this team.");
        return;
      }

      toast.success("Invite accepted. Welcome to SnapQuote.");
      router.replace("/app");
    })().catch((nextError) => {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "We couldn't finish joining this team."
      );
    });
  }, [router, token]);

  if (!error) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-slate-50 px-4 py-4 text-sm text-muted-foreground">
          Finishing your team invite...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
        {error}
      </p>
      <div className="space-y-3">
        <Button
          type="button"
          className="h-11 w-full rounded-xl text-sm font-semibold"
          onClick={() => router.replace("/app")}
        >
          Go to Dashboard
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Need to try again?{" "}
          <Link
            href={`/invite/${encodeURIComponent(token)}`}
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Back to invite
          </Link>
        </p>
      </div>
    </div>
  );
}
