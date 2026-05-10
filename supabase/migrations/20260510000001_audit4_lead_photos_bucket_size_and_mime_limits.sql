-- Audit 4 H4 / Audit 8 M1 — lead-photos storage bucket hardening
--
-- Pre-fix: storage.buckets row for `lead-photos` had file_size_limit=NULL
-- and allowed_mime_types=NULL, so all enforcement happened at the upload
-- route only. Defense-in-depth gap; a future code path uploading to the
-- bucket without going through /api/public/lead-photo-upload would skip
-- the MIME/size guards.
--
-- Sets a generous 50 MB cap (52 428 800 bytes) and an image-only MIME
-- allowlist that mirrors `ALLOWED_MIME_TYPES` in
-- app/api/public/lead-photo-upload/route.ts. The route enforces a tighter
-- 10 MB per-photo cap; this bucket-level cap exists to catch accidental
-- video / RAW uploads from any future writer.

UPDATE storage.buckets
SET
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/heic',
    'image/heif',
    'image/webp'
  ]
WHERE id = 'lead-photos';
