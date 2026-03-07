import { type ClassValue, clsx } from "clsx";
import { formatDistanceToNowStrict } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .replace(/-{2,}/g, "-");
}

export function randomSuffix(length = 4): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length })
    .map(() => chars[Math.floor(Math.random() * chars.length)])
    .join("");
}

export function toCurrency(value: number | string | null): string {
  if (value === null) return "$0";
  const numeric = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(numeric)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(numeric);
}

export function toRelativeMinutes(dateInput: string | Date): string {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

export function publicQuoteExpiry(sentAt: string | Date): Date {
  const sent = sentAt instanceof Date ? sentAt : new Date(sentAt);
  const expires = new Date(sent);
  expires.setDate(expires.getDate() + 7);
  return expires;
}
