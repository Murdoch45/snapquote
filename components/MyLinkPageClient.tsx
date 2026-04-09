"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Download, ExternalLink, Link2, Share2 } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  businessName: string;
  requestLink: string;
  initialSocialCaption: string;
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

async function copyText(text: string) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (!fallbackCopy(text)) {
    throw new Error("Copy failed");
  }
}

export function MyLinkPageClient({
  businessName,
  requestLink,
  initialSocialCaption
}: Props) {
  const qrCodeRef = useRef<HTMLCanvasElement | null>(null);
  const captionTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [socialCaption, setSocialCaption] = useState(initialSocialCaption);
  const [draftCaption, setDraftCaption] = useState(initialSocialCaption);
  const [savingCaption, setSavingCaption] = useState(false);
  const [isEditingCaption, setIsEditingCaption] = useState(false);

  useEffect(() => {
    setSocialCaption(initialSocialCaption);
    setDraftCaption(initialSocialCaption);
  }, [initialSocialCaption]);

  useEffect(() => {
    if (!isEditingCaption) return;

    captionTextareaRef.current?.focus();
  }, [isEditingCaption]);

  const onCopyLink = async () => {
    try {
      await copyText(requestLink);
      toast.success("Request link copied.");
    } catch {
      toast.error("Could not copy link.");
    }
  };

  const onShareLink = async () => {
    // Prefer the native share sheet (mobile Safari, mobile Chrome, etc.).
    // Fall back to clipboard on desktop browsers that don't implement
    // navigator.share.
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: businessName,
          text: socialCaption,
          url: requestLink
        });
        return;
      } catch (error) {
        // The user dismissing the share sheet rejects with AbortError —
        // treat it as a silent no-op rather than a failure.
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        // Any other failure falls through to the clipboard path below.
      }
    }

    try {
      await copyText(requestLink);
      toast.success("Sharing isn't available here — link copied instead.");
    } catch {
      toast.error("Could not share or copy link.");
    }
  };

  const onCopyCaption = async () => {
    try {
      await copyText(socialCaption);
      toast.success("Caption copied.");
    } catch {
      toast.error("Could not copy caption.");
    }
  };

  const onSaveCaption = async () => {
    setSavingCaption(true);

    try {
      const response = await fetch("/api/app/my-link/caption", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ socialCaption: draftCaption })
      });
      const json = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(json.error || "Could not save caption.");
      }

      setSocialCaption(draftCaption);
      setIsEditingCaption(false);
      toast.success("Caption saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save caption.");
    } finally {
      setSavingCaption(false);
    }
  };

  const onStartEditingCaption = () => {
    setDraftCaption(socialCaption);
    setIsEditingCaption(true);
  };

  const onCancelEditingCaption = () => {
    setDraftCaption(socialCaption);
    setIsEditingCaption(false);
  };

  const onDownloadQrCode = () => {
    const canvas = qrCodeRef.current;
    if (!canvas) {
      toast.error("QR code is not ready yet.");
      return;
    }

    const anchor = document.createElement("a");
    const fileName = `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "snapquote"}-qr-code.png`;
    anchor.href = canvas.toDataURL("image/png");
    anchor.download = fileName;
    anchor.click();
    toast.success("QR code downloaded.");
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader className="pb-4">
          <p className="text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">Share</p>
          <CardDescription>Share your link with your caption via text or social</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button type="button" onClick={onShareLink}>
            <Share2 className="mr-2 h-4 w-4" />
            Share Link
          </Button>
          <div className="rounded-[8px] border border-[#FCD34D] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]">
            Your link updates automatically if you change your Public URL in Settings.
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader className="pb-4">
          <p className="text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">Your Link</p>
          <CardDescription>Your public request page URL</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative rounded-[8px] border border-[#E5E7EB] bg-[#F8F9FC] px-4 py-3">
            <Link2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
            <Input
              className="h-auto border-0 bg-transparent px-0 pl-7 py-0 text-sm font-medium text-[#111827] shadow-none focus-visible:ring-0"
              value={requestLink}
              readOnly
              aria-label="Public request page URL"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={onCopyLink}>
              <Copy className="mr-2 h-4 w-4" />
              Copy Link
            </Button>
            <Button asChild type="button">
              <a href={requestLink} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Open Page
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader className="pb-4">
          <p className="text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">
            Social Caption
          </p>
          <CardDescription>Ready-to-post copy for social or text messages</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={
              isEditingCaption
                ? "rounded-[10px] shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                : undefined
            }
          >
            <Textarea
              ref={captionTextareaRef}
              value={isEditingCaption ? draftCaption : socialCaption}
              onChange={(event) => setDraftCaption(event.target.value)}
              readOnly={!isEditingCaption}
              className={
                isEditingCaption
                ? "min-h-[100px] resize-none rounded-[8px] border-2 border-[#2563EB] bg-white px-[14px] py-3 text-sm text-[#111827] shadow-[0_0_0_3px_rgba(37,99,235,0.1)] focus-visible:ring-0"
                : "min-h-[100px] resize-none rounded-[8px] border border-[#E5E7EB] bg-[#F8F9FC] px-[14px] py-3 text-sm text-[#111827] pointer-events-none focus-visible:ring-0"
              }
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              type="button"
              className="w-full sm:min-w-[160px] sm:w-auto"
              onClick={onCopyCaption}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy Caption
            </Button>
            {isEditingCaption ? (
              <>
                <Button
                  type="button"
                  className="w-full sm:min-w-[160px] sm:w-auto"
                  onClick={onSaveCaption}
                  disabled={savingCaption}
                >
                  {savingCaption ? "Saving..." : "Save Caption"}
                </Button>
                <button
                  type="button"
                  onClick={onCancelEditingCaption}
                  className="w-full text-sm font-medium text-[#6B7280] transition-colors hover:text-[#111827] sm:min-w-[160px] sm:w-auto"
                >
                  Cancel
                </button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full border-2 border-[#2563EB] bg-transparent text-[#2563EB] hover:bg-[#EFF6FF] sm:min-w-[160px] sm:w-auto"
                onClick={onStartEditingCaption}
              >
                Edit Caption
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader className="pb-4">
          <p className="text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">QR Code</p>
          <CardDescription>Download or share a scannable version of your public page</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-center">
            <div className="inline-flex rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
              <QRCodeCanvas
                ref={qrCodeRef}
                value={requestLink}
                size={220}
                marginSize={4}
                bgColor="#FFFFFF"
                fgColor="#111827"
                title={`QR Code for ${businessName}`}
              />
            </div>
          </div>
          <Button type="button" onClick={onDownloadQrCode}>
            <Download className="mr-2 h-4 w-4" />
            Download QR Code
          </Button>
          <div className="rounded-[8px] border border-[#FCD34D] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]">
            Your QR code updates automatically if you change your Public URL in Settings.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
