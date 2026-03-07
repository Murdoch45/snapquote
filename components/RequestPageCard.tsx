"use client";

import { toast } from "sonner";
import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  requestLink: string;
};

function fallbackCopy(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

export function RequestPageCard({ requestLink }: Props) {
  const onCopy = async () => {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(requestLink);
      } else if (!fallbackCopy(requestLink)) {
        throw new Error("Copy failed");
      }
      toast.success("Request link copied.");
    } catch {
      toast.error("Could not copy link.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request Page</CardTitle>
        <CardDescription>
          Your SnapQuote Request Link
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900">
          {requestLink}
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={onCopy}>
            <Copy className="mr-2 h-4 w-4" />
            Copy Link
          </Button>
          <Button asChild type="button" variant="outline">
            <a href={requestLink} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Page
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
