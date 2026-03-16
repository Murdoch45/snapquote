"use client";

type Props = {
  confidence: number;
};

export function clampDisplayConfidence(confidence: number): number {
  return Math.min(Math.max(confidence, 0.25), 1);
}

export function ConfidenceMeter({ confidence }: Props) {
  const displayConfidence = clampDisplayConfidence(confidence);
  const label =
    confidence >= 0.78 ? "High confidence" : confidence >= 0.52 ? "Medium confidence" : "Low confidence";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">AI Confidence</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
        <p className="text-sm font-semibold text-gray-700">
          {Math.round(confidence * 100)}%
        </p>
      </div>
      <div className="relative pt-5">
        <div className="h-3 overflow-hidden rounded-full bg-gradient-to-r from-red-500 via-orange-400 via-yellow-300 to-emerald-500 shadow-inner" />
        <div
          className="absolute top-0 transition-all duration-500 ease-out"
          style={{ left: `calc(${displayConfidence * 100}% - 10px)` }}
        >
          <div className="h-5 w-5 rounded-full border-2 border-white bg-slate-900 shadow-lg" />
          <div className="mx-auto h-3 w-0.5 rounded-full bg-slate-900" />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-gray-400">
        <span>Low</span>
        <span>High</span>
      </div>
    </div>
  );
}
