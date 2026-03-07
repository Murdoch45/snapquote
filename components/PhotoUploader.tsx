"use client";

import { useMemo, useRef } from "react";
import { UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type PhotoUploaderProps = {
  files: File[];
  setFiles: (files: File[]) => void;
  maxFiles?: number;
};

export function PhotoUploader({
  files,
  setFiles,
  maxFiles = 5
}: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files]
  );

  const onAddFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const current = [...files];
    for (const file of Array.from(incoming)) {
      if (current.length >= maxFiles) break;
      if (file.size > 8 * 1024 * 1024) continue;
      current.push(file);
    }
    setFiles(current.slice(0, maxFiles));
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
        <p className="mb-3 text-sm text-gray-600">
          Add photos for more accurate estimate (up to {maxFiles}).
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => onAddFiles(e.target.files)}
          className="hidden"
          id="photo-upload-input"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={files.length >= maxFiles}
        >
          <UploadCloud className="mr-2 h-4 w-4" />
          Upload photos
        </Button>
      </div>
      {previews.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {previews.map(({ file, url }, index) => (
            <div key={`${file.name}-${index}`} className="group relative overflow-hidden rounded-md">
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
    </div>
  );
}
