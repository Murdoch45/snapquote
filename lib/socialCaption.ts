// Shared social-caption helpers for the My Link tab.
//
// This file MUST stay byte-identical with SnapQuote-mobile/lib/socialCaption.ts.
// Cross-repo sharing is done via duplicated-identical files (same convention
// as lib/plans.ts) because there is no shared npm package. Any edit here
// needs the matching edit on the mobile side before either ships.

export const SOCIAL_CAPTION_MAX_LENGTH = 5000;

export function resolveBusinessNameForCaption(opts: {
  profileBusinessName?: string | null;
  organizationName?: string | null;
}): string {
  const profile = opts.profileBusinessName?.trim();
  if (profile) return profile;
  const org = opts.organizationName?.trim();
  if (org) return org;
  return "SnapQuote";
}

export function buildDefaultSocialCaption(opts: {
  businessName: string;
  requestLink: string;
}): string {
  return `Need an estimate? ${opts.businessName} makes it easy - just fill out a quick form and we'll get back to you as soon as possible. ${opts.requestLink}`;
}
