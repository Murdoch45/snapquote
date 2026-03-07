"use client";

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toCurrency } from "@/lib/utils";

type PriceSliderProps = {
  estimateLow: number;
  estimateHigh: number;
  value: number;
  onChange: (value: number) => void;
};

export function PriceSlider({
  estimateLow,
  estimateHigh,
  value,
  onChange
}: PriceSliderProps) {
  const { min, max } = useMemo(() => {
    const spread = Math.max(estimateHigh - estimateLow, 100);
    const extension = Math.ceil(spread * 0.25);
    return {
      min: Math.max(0, estimateLow - extension),
      max: estimateHigh + extension
    };
  }, [estimateLow, estimateHigh]);

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="price-range">Final price</Label>
        <p className="text-sm font-medium text-gray-700">{toCurrency(value)}</p>
      </div>
      <input
        id="price-range"
        type="range"
        min={min}
        max={max}
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
        <Input
          id="price-input"
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(Number(e.target.value || 0))}
        />
      </div>
    </div>
  );
}
