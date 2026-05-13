import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 120;

const ALLOWED_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/webm",
]);
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

function logError(label: string, err: unknown) {
  console.error(`\n[upload] ❌ ${label}`);
  if (err instanceof Error) {
    console.error(`  message : ${err.message}`);
    console.error(`  name    : ${err.name}`);
    if (err.stack) console.error(`  stack   :\n${err.stack}`);
    // Log any extra properties (e.g. Supabase StorageError has statusCode, error)
    const extras = Object.entries(err).filter(([k]) => !["message", "name", "stack"].includes(k));
    if (extras.length) console.error(`  details :`, Object.fromEntries(extras));
  } else {
    console.error(`  raw     :`, err);
  }
}

export async function POST(req: Request) {
  console.log("UPLOAD ROUTE HIT");
  console.log("\n[upload] ── POST /api/upload ──────────────────────────────");
  try {
    console.log("[upload] Parsing multipart form data…");
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      console.error("[upload] No file field in form data");
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    console.log(`[upload] File received: name="${file.name}" type="${file.type}" size=${file.size} bytes (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

    if (!ALLOWED_TYPES.has(file.type)) {
      console.error(`[upload] Rejected: unsupported type "${file.type}"`);
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Must be mp4, mov, avi, or webm.` },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      console.error(`[upload] Rejected: file too large (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      return NextResponse.json(
        { error: `File too large (${Math.round(file.size / 1024 / 1024)} MB). Maximum is 500 MB.` },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    console.log(`[upload] Supabase URL set: ${!!supabaseUrl} | Service key set: ${!!serviceKey}`);
    if (!supabaseUrl || !serviceKey) {
      console.error("[upload] Missing Supabase env vars");
      return NextResponse.json(
        { error: "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local." },
        { status: 503 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `uploads/${Date.now()}_${safeName}`;
    console.log(`[upload] Uploading to Supabase bucket "videos" at path: ${path}`);

    console.log("[upload] Converting file to ArrayBuffer for Supabase upload…");
    const arrayBuffer = await file.arrayBuffer();
    console.log(`[upload] ArrayBuffer size: ${arrayBuffer.byteLength} bytes`);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("videos")
      .upload(path, arrayBuffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      logError("Supabase storage upload failed", uploadError);
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    console.log("[upload] Supabase upload success:", uploadData);

    const { data: urlData } = supabase.storage.from("videos").getPublicUrl(path);
    console.log(`[upload] Public URL: ${urlData.publicUrl}`);

    return NextResponse.json({ publicUrl: urlData.publicUrl });
  } catch (err) {
    logError("Unexpected exception", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
