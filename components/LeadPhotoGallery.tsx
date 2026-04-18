"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type LeadPhotoGalleryProps = {
  photos: string[];
};

export function LeadPhotoGallery({ photos }: LeadPhotoGalleryProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const isOpen = activeIndex !== null;

  const close = useCallback(() => setActiveIndex(null), []);

  const showPrev = useCallback(() => {
    setActiveIndex((current) => {
      if (current === null || photos.length === 0) return current;
      return (current - 1 + photos.length) % photos.length;
    });
  }, [photos.length]);

  const showNext = useCallback(() => {
    setActiveIndex((current) => {
      if (current === null || photos.length === 0) return current;
      return (current + 1) % photos.length;
    });
  }, [photos.length]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        showNext();
      }
    };

    window.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, close, showPrev, showNext]);

  if (photos.length === 0) {
    return <p className="text-sm text-muted-foreground">No photos uploaded.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {photos.map((url, index) => (
          <button
            key={`${url}-${index}`}
            type="button"
            onClick={() => setActiveIndex(index)}
            className="group relative overflow-hidden rounded-md border border-transparent transition-all hover:border-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label={`Open photo ${index + 1} of ${photos.length}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Lead photo ${index + 1}`}
              className="h-28 w-full object-cover transition-transform group-hover:scale-[1.02]"
            />
          </button>
        ))}
      </div>

      {isOpen && activeIndex !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Photo ${activeIndex + 1} of ${photos.length}`}
          className="fixed inset-0 z-[90] flex items-center justify-center"
        >
          <button
            type="button"
            aria-label="Close photo viewer"
            onClick={close}
            className="absolute inset-0 bg-slate-950/90"
          />

          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-4 py-4 sm:px-6">
            <span className="pointer-events-auto rounded-full bg-slate-900/70 px-3 py-1 text-sm font-medium text-white">
              {activeIndex + 1} of {photos.length}
            </span>
            <button
              type="button"
              aria-label="Close"
              onClick={close}
              className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div
            className="relative flex h-full w-full items-center justify-center px-4 sm:px-16"
            onClick={close}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photos[activeIndex]}
              alt={`Lead photo ${activeIndex + 1}`}
              className="max-h-[calc(100vh-6rem)] max-w-full rounded-md object-contain shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            />
          </div>

          {photos.length > 1 ? (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={showPrev}
                className="absolute left-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:left-6"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={showNext}
                className="absolute right-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:right-6"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
