# Supabase Setup Guide

This project uses Supabase Storage to host video files uploaded via the **File Upload** tab in the Add Video modal. Files are uploaded server-side through `/api/upload`, then the resulting public URL is passed to TwelveLabs for indexing.

---

## 1. Create a Supabase Project

Go to [supabase.com](https://supabase.com) and create a new project if you don't have one.

---

## 2. Get Your Credentials

In your Supabase project, navigate to **Settings → API**.

You need three values:

| Variable | Where to find it | Exposure |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | Public (client-safe) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project API Keys → `anon public` | Public (client-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Project API Keys → `service_role` | **Server-only — never expose to client** |

Add all three to your `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

> **Security note:** The service role key bypasses Row Level Security (RLS). It must only be used in server-side code (`app/api/upload/route.ts`). It is never passed to the browser. Do not prefix it with `NEXT_PUBLIC_`.

---

## 3. Create the Storage Bucket

1. In your Supabase project, go to **Storage** in the left sidebar.
2. Click **New bucket**.
3. Set **Name** to exactly `videos`.
4. Enable **Public bucket** (so `getPublicUrl` returns a usable URL without signed tokens).
5. Click **Save**.

> **Why Public?** TwelveLabs downloads the video from the URL you provide. A public bucket means TwelveLabs can fetch the file without authentication headers. If you prefer a private bucket, you would need to generate a signed URL and pass that to TwelveLabs instead.

---

## 4. File Size Limits

Supabase Storage has a default file size limit per bucket:

- **Free plan:** 50 MB per file
- **Pro plan:** 5 GB per file (configurable)

This project enforces a **500 MB** client-side limit. To actually upload files up to 500 MB you need a paid plan **and** to increase the bucket's file size limit:

1. Go to **Storage → videos bucket → Settings**.
2. Set **File size limit** to `524288000` (500 MB in bytes) or higher.

For development and testing, files under 50 MB will work on the free plan.

---

## 5. How the Upload Flow Works

```
Browser → POST /api/upload (multipart/form-data)
  ↓
app/api/upload/route.ts (server-side)
  ↓
Supabase Storage: uploads to videos/uploads/{timestamp}_{filename}
  ↓
Returns { publicUrl } back to browser
  ↓
Browser → POST /api/analyze { videoUrl: publicUrl, ... }
  ↓
TwelveLabs downloads the video from the public Supabase URL
```

The service role key is used only in step 3 — on the server. It never touches the browser.

---

## 6. File Path Convention

Files are stored at:

```
uploads/{timestamp}_{sanitized_filename}
```

Example: `uploads/1747123456789_my_review.mp4`

- The timestamp prevents filename collisions.
- Special characters in the filename are replaced with `_`.

---

## 7. Cleanup (Optional)

Uploaded videos remain in the bucket indefinitely. To avoid storage costs accumulating, you can:

- Set up a Supabase Edge Function to delete objects older than N days.
- Or manually purge the `uploads/` folder in **Storage → videos** periodically.

---

## 8. Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `Supabase is not configured` | Env vars not set | Add all three vars to `.env.local` and restart the dev server |
| `Storage upload failed: new row violates row-level security` | Service role key is wrong or missing | Double-check `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` |
| `File too large` | Exceeds 500 MB client check | Compress the video or use the Direct URL tab with a pre-hosted file |
| `TwelveLabs: 403 / cannot download` | Bucket is not public | Enable "Public bucket" in Supabase Storage settings |
