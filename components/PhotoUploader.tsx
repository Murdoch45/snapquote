"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.65;
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_COMPRESSED_SIZE = 400_000;
const RETRY_DIMENSION = 1200;
const RETRY_QUALITY = 0.5;

// Per-photo status as the upload progresses through its lifecycle. The
// PublicLeadForm consumes this to decide what the submit button does
// (block on any "failed", proceed without waiting on "uploading").
export type PhotoUploadStatus = "uploading" | "done" | "failed";

export type PhotoEntry = {
  // Stable client-side id used for React keys + for matching a
  // status-update from the parent back to its row in this component.
  // Generated when the file is picked (crypto.randomUUID()).
  localId: string;
  file: File;
  status: PhotoUploadStatus;
  // Set when status === "done". Sent to /api/public/lead-submit.
  storagePath?: string;
  publicUrl?: string;
  // Set when status === "failed". Surfaced inline next to the photo so
  // the customer can decide to retry or remove.
  errorMessage?: string;
};

type PhotoUploaderProps = {
  entries: PhotoEntry[];
  onAddFiles: (files: File[]) => void;
  onRemove: (localId: string) => void;
  onRetry: (localId: string) => void;
  maxFiles?: number;
  required?: boolean;
};

function renderToBlob(
  img: HTMLImageElement,
  maxDim: number,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    let { width, height } = img;

    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      resolve(null);
      return;
    }

    ctx.drawImage(img, 0, 0, width, height);
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = async () => {
      URL.revokeObjectURL(url);

      // Skip compression if already small enough
      if (file.size <= MAX_COMPRESSED_SIZE && img.width <= MAX_DIMENSION && img.height <= MAX_DIMENSION) {
        resolve(file);
        return;
      }

      const name = file.name.replace(/\.[^.]+$/, ".jpg");

      // First pass
      let blob = await renderToBlob(img, MAX_DIMENSION, JPEG_QUALITY);

      // If toBlob returned null (iOS memory pressure), retry at smaller size
      if (!blob) {
        blob = await renderToBlob(img, RETRY_DIMENSION, RETRY_QUALITY);
      }

      // If still over size limit, re-compress more aggressively
      if (blob && blob.size > MAX_COMPRESSED_SIZE) {
        const secondPass = await renderToBlob(img, RETRY_DIMENSION, RETRY_QUALITY);
        if (secondPass) blob = secondPass;
      }

      if (!blob) {
        resolve(file);
        return;
      }

      resolve(new File([blob], name, { type: "image/jpeg", lastModified: Date.now() }));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}

export function PhotoUploader({
  entries,
  onAddFiles,
  onRemove,
  onRetry,
  maxFiles = 10,
  required = false
}: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [compressing, setCompressing] = useState(false);

  // Per-entry preview URLs. Held in this component so we can revoke
  // them when the entry is removed / on unmount, avoiding memory leaks
  // on customers who pick + remove a lot of photos.
  const previewUrls = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of entries) {
      map.set(entry.localId, URL.createObjectURL(entry.file));
    }
    return map;
  }, [entries]);

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  const handleSelectFiles = async (incoming: FileList | null) => {
    if (!incoming) return;

    setCompressing(true);
    try {
      const remainingSlots = Math.max(0, maxFiles - entries.length);
      const accepted: File[] = [];
      for (const raw of Array.from(incoming)) {
        if (accepted.length >= remainingSlots) break;
        if (raw.size > MAX_FILE_SIZE) continue;
        // eslint-disable-next-line no-await-in-loop
        const compressed = await compressImage(raw);
        accepted.push(compressed);
      }
      if (accepted.length > 0) {
        onAddFiles(accepted);
      }
    } finally {
      setCompressing(false);
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const failedCount = entries.filter((entry) => entry.status === "failed").length;
  const uploadingCount = entries.filter((entry) => entry.status === "uploading").length;
  const doneCount = entries.filter((entry) => entry.status === "done").length;
  const slotsLeft = Math.max(0, maxFiles - entries.length);

  return (
    <div className="min-w-0 max-w-full space-y-3 overflow-x-hidden">
      <div className="max-w-full overflow-x-hidden rounded-[12px] border-2 border-dashed border-primary/40 bg-muted p-6 text-center">
        <p className="mb-4 text-sm text-muted-foreground">
          {required
            ? `Upload at least 1 photo for an estimate request (up to ${maxFiles}).`
            : `Add photos for more accurate estimate (up to ${maxFiles}).`}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => void handleSelectFiles(e.target.files)}
          className="hidden"
          id="photo-upload-input"
          aria-label="Upload photos"
        />
        <Button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={slotsLeft === 0 || compressing}
          aria-disabled={slotsLeft === 0 || compressing}
          className="max-w-full"
        >
          <UploadCloud aria-hidden="true" className="mr-2 h-4 w-4" />
          {compressing ? "Preparing..." : "Upload photos"}
        </Button>
        {entries.length > 0 ? (
          <p className="mt-3 text-xs text-muted-foreground" role="status" aria-live="polite">
            {doneCount} ready
            {uploadingCount > 0 ? ` · ${uploadingCount} uploading` : ""}
            {failedCount > 0 ? ` · ${failedCount} failed` : ""}
          </p>
        ) : null}
      </div>
      {entries.length > 0 && (
        <div className="grid min-w-0 max-w-full grid-cols-2 gap-3 sm:grid-cols-3">
          {entries.map((entry) => {
            const url = previewUrls.get(entry.localId) ?? "";
            return (
              <div
                key={entry.localId}
                className="group relative min-w-0 max-w-full overflow-hidden rounded-[12px] border border-border bg-card"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="Uploaded photo"
                  className={`h-24 w-full max-w-full object-cover ${
                    entry.status === "uploading" ? "opacity-60" : ""
                  } ${entry.status === "failed" ? "opacity-40" : ""}`}
                />

                {/* Status overlay — bottom-left corner */}
                <div className="pointer-events-none absolute bottom-1 left-1 flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-semibold text-white">
                  {entry.status === "uploading" ? (
                    <>
                      <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                      Uploading
                    </>
                  ) : entry.status === "done" ? (
                    <>
                      <CheckCircle2 aria-hidden="true" className="h-3 w-3" />
                      Ready
                    </>
                  ) : (
                    <>
                      <AlertTriangle aria-hidden="true" className="h-3 w-3" />
                      Failed
                    </>
                  )}
                </div>

                {/* Top-right action(s): always-visible remove + retry-if-failed.
                    The remove button used to fade-in on hover, but the
                    sibling status overlay made hover discovery
                    inconsistent on touch — keeping it always visible is
                    clearer. */}
                <div className="absolute right-1 top-1 flex items-center gap-1">
                  {entry.status === "failed" ? (
                    <button
                      type="button"
                      aria-label="Retry photo upload"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-white"
                      onClick={() => onRetry(entry.localId)}
                    >
                      <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-label="Remove uploaded photo"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-white"
                    onClick={() => onRemove(entry.localId)}
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>

                {entry.status === "failed" && entry.errorMessage ? (
                  <p
                    role="alert"
                    aria-live="polite"
                    className="bg-red-50 px-2 py-1 text-[10px] leading-tight text-red-700 dark:bg-red-950/40 dark:text-red-300"
                  >
                    {entry.errorMessage}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {required && entries.length === 0 ? (
        <p role="alert" aria-live="polite" className="text-xs text-red-600 dark:text-red-400">
          At least one photo is required before submission.
        </p>
      ) : null}
    </div>
  );
}
