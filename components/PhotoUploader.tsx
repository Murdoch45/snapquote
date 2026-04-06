"use client";

import { useMemo, useRef, useState } from "react";
import { UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.65;
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_COMPRESSED_SIZE = 400_000;
const RETRY_DIMENSION = 1200;
const RETRY_QUALITY = 0.5;

type PhotoUploaderProps = {
  files: File[];
  setFiles: (files: File[]) => void;
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
  files,
  setFiles,
  maxFiles = 10,
  required = false
}: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [compressing, setCompressing] = useState(false);

  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files]
  );

  const onAddFiles = async (incoming: FileList | null) => {
    if (!incoming) return;

    setCompressing(true);
    try {
      const current = [...files];
      for (const raw of Array.from(incoming)) {
        if (current.length >= maxFiles) break;
        if (raw.size > MAX_FILE_SIZE) continue;
        // eslint-disable-next-line no-await-in-loop
        const compressed = await compressImage(raw);
        current.push(compressed);
      }
      setFiles(current.slice(0, maxFiles));
    } finally {
      setCompressing(false);
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-3">
      <div className="rounded-[12px] border-2 border-dashed border-[#BFDBFE] bg-[#F8FBFF] p-6 text-center">
        <p className="mb-4 text-sm text-[#6B7280]">
          {required
            ? `Upload at least 1 photo for an estimate request (up to ${maxFiles}).`
            : `Add photos for more accurate estimate (up to ${maxFiles}).`}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => void onAddFiles(e.target.files)}
          className="hidden"
          id="photo-upload-input"
        />
        <Button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={files.length >= maxFiles || compressing}
        >
          <UploadCloud className="mr-2 h-4 w-4" />
          {compressing ? "Compressing..." : "Upload photos"}
        </Button>
      </div>
      {previews.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {previews.map(({ file, url }, index) => (
            <div key={`${file.name}-${index}`} className="group relative overflow-hidden rounded-[12px] border border-[#E5E7EB] bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={file.name} className="h-24 w-full object-cover" />
              <button
                type="button"
                className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-white opacity-0 transition group-hover:opacity-100"
                onClick={() => setFiles(files.filter((_, i) => i !== index))}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      {required && files.length === 0 ? (
        <p className="text-xs text-[#DC2626]">At least one photo is required before submission.</p>
      ) : null}
    </div>
  );
}
