"use client";

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toCurrency } from "@/lib/utils";

type PriceSliderProps = {
  snapQuote: number;
  value: number;
  onChange: (value: number) => void;
};

export function PriceSlider({ snapQuote, value, onChange }: PriceSliderProps) {
  const { min, max } = useMemo(() => {
    const extension = Math.max(100, Math.ceil(snapQuote * 0.25));
    return {
      min: Math.max(0, snapQuote - extension),
      max: snapQuote + extension
    };
  }, [snapQuote]);

  const snapQuoteLeft = `${((snapQuote - min) / Math.max(max - min, 1)) * 100}%`;

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="price-range">Final price</Label>
        <p className="text-sm font-medium text-gray-700">{toCurrency(value)}</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="relative h-12">
          <div
            className="absolute top-0 -translate-x-1/2 text-center"
            style={{ left: snapQuoteLeft }}
          >
            <div className="mx-auto h-2.5 w-2.5 rounded-full bg-blue-600" />
            <p className="mt-1 text-[11px] font-semibold text-gray-700">SnapQuote</p>
            <p className="text-[11px] text-gray-500">{toCurrency(snapQuote)}</p>
          </div>
        </div>
      </div>
      <input
        id="price-range"
        type="range"
        min={min}
        max={max}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-blue-600"
      />
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{toCurrency(min)}</span>
        <span>{toCurrency(max)}</span>
      </div>
      <div>
        <Label htmlFor="price-input">Manual price input</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
            $
          </span>
          <Input
            id="price-input"
            type="number"
            min={0}
            step={5}
            value={value}
            onChange={(e) => onChange(Number(e.target.value || 0))}
            className="pl-7"
          />
        </div>
      </div>
    </div>
  );
}
