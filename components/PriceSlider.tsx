"use client";

import * as Slider from "@radix-ui/react-slider";
import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toCurrency } from "@/lib/utils";

type PriceSliderProps = {
  low: number;
  high: number;
  onChange: ((low: number, high: number) => void) | ((value: { low: number; high: number }) => void);
  snapQuote?: number;
};

const STEP = 25;

function roundToStep(value: number) {
  return Math.round(value / STEP) * STEP;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalize(low: number, high: number, min: number, max: number) {
  const nextLow = clamp(roundToStep(low), min, max);
  const nextHigh = clamp(roundToStep(high), nextLow, max);
  return { low: nextLow, high: nextHigh };
}

// Fallback working range for the slider when the caller has no real
// estimate to seed it (e.g. an AI-failed lead with no manual quote yet).
// Picks a reasonable default span so the contractor can immediately drag
// to a sensible price instead of the slider snapping to $0–$25.
const FALLBACK_TRACK_MIN = 0;
const FALLBACK_TRACK_MAX = 5000;

export function PriceSlider({ low, high, onChange }: PriceSliderProps) {
  // If both endpoints are non-positive we have no real signal to derive
  // bounds from. Use the working-range fallback instead of the
  // half/double math (which would collapse to 0–STEP).
  const hasSignal = low > 0 || high > 0;
  const boundsRef = useRef(
    hasSignal
      ? {
          min: Math.max(0, Math.round((low * 0.5) / STEP) * STEP),
          max: Math.round((high * 2) / STEP) * STEP
        }
      : { min: FALLBACK_TRACK_MIN, max: FALLBACK_TRACK_MAX }
  );

  const trackMin = boundsRef.current.min;
  const trackMax = Math.max(boundsRef.current.max, trackMin + STEP);
  const range = normalize(low, high, trackMin, trackMax);

  const emitChange = (nextLow: number, nextHigh: number) => {
    const next = normalize(nextLow, nextHigh, trackMin, trackMax);
    if (onChange.length >= 2) {
      (onChange as (low: number, high: number) => void)(next.low, next.high);
      return;
    }
    (onChange as (value: { low: number; high: number }) => void)(next);
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted p-4">
      <div className="flex items-center justify-between">
        <Label>Estimate range</Label>
        <p className="text-sm font-medium text-foreground/80">
          {toCurrency(range.low)} - {toCurrency(range.high)}
        </p>
      </div>

      <Slider.Root
        value={[range.low, range.high]}
        min={trackMin}
        max={trackMax}
        step={STEP}
        minStepsBetweenThumbs={0}
        onValueChange={([nextLow = range.low, nextHigh = range.high]) => emitChange(nextLow, nextHigh)}
        className="relative flex h-10 w-full touch-none select-none items-center"
      >
        <Slider.Track className="relative h-2 w-full grow rounded-full bg-border">
          <Slider.Range className="absolute h-full rounded-full bg-blue-500" />
        </Slider.Track>
        <Slider.Thumb
          aria-label="Low price handle"
          className="block h-6 w-6 rounded-full border-2 border-blue-600 bg-card shadow outline-none focus-visible:ring-2 focus-visible:ring-blue-300 sm:h-5 sm:w-5"
        />
        <Slider.Thumb
          aria-label="High price handle"
          className="block h-6 w-6 rounded-full border-2 border-emerald-600 bg-card shadow outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 sm:h-5 sm:w-5"
        />
      </Slider.Root>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{toCurrency(trackMin)}</span>
        <span>{toCurrency(trackMax)}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="price-input-low">Low</Label>
          <Input
            id="price-input-low"
            type="number"
            min={trackMin}
            max={range.high}
            step={STEP}
            value={range.low}
            onChange={(e) => emitChange(Number(e.target.value || 0), range.high)}
          />
        </div>
        <div>
          <Label htmlFor="price-input-high">High</Label>
          <Input
            id="price-input-high"
            type="number"
            min={range.low}
            max={trackMax}
            step={STEP}
            value={range.high}
            onChange={(e) => emitChange(range.low, Number(e.target.value || 0))}
          />
        </div>
      </div>
    </div>
  );
}
