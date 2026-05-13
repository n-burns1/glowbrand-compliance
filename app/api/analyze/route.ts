import { NextResponse } from "next/server";
import {
  ensureIndex,
  uploadVideo,
  waitForIndexing,
  analyzeVideo,
} from "@/lib/twelvelabs";

// Allow up to 5 minutes for the full indexing + analysis pipeline
export const maxDuration = 300;

function logError(label: string, err: unknown) {
  console.error(`\n[analyze] ❌ ${label}`);
  if (err instanceof Error) {
    console.error(`  message : ${err.message}`);
    console.error(`  name    : ${err.name}`);
    if (err.stack) console.error(`  stack   :\n${err.stack}`);
    const extras = Object.entries(err).filter(([k]) => !["message", "name", "stack"].includes(k));
    if (extras.length) console.error(`  details :`, Object.fromEntries(extras));
  } else {
    console.error(`  raw     :`, err);
  }
}

export async function POST(req: Request) {
  console.log("\n[analyze] ── POST /api/analyze ────────────────────────────");
  const body = await req.json();
  const { videoUrl, handle, platform, title } = body;

  console.log("[analyze] Request body:", { videoUrl, handle, platform, title });

  if (!videoUrl || !handle || !platform || !title) {
    const missing = ["videoUrl", "handle", "platform", "title"].filter((k) => !body[k]);
    console.error(`[analyze] Missing required fields: ${missing.join(", ")}`);
    return NextResponse.json(
      { error: "All fields are required", missing },
      { status: 400 }
    );
  }

  try {
    console.log("[analyze] Step 1/4 — ensureIndex()");
    const indexId = await ensureIndex();
    console.log(`[analyze] Index ID: ${indexId}`);

    console.log(`[analyze] Step 2/4 — uploadVideo(indexId="${indexId}", videoUrl="${videoUrl}")`);
    const taskId = await uploadVideo(indexId, videoUrl);
    console.log(`[analyze] Task ID: ${taskId}`);

    console.log(`[analyze] Step 3/4 — waitForIndexing(taskId="${taskId}")`);
    const videoId = await waitForIndexing(taskId);
    console.log(`[analyze] Video ID: ${videoId}`);

    console.log(`[analyze] Step 4/4 — analyzeVideo(videoId="${videoId}")`);
    const report = await analyzeVideo(videoId);
    console.log(`[analyze] Report: score=${report.score} status="${report.status}" rules=${report.rules.length}`);
    report.rules.forEach((r) =>
      console.log(`  rule ${r.id} "${r.name}": passed=${r.passed} | response="${r.response.slice(0, 80)}…"`)
    );

    console.log("[analyze] ✅ Pipeline complete");
    return NextResponse.json({
      jobId: `job_${Date.now()}`,
      score: report.score,
      status: report.status,
      report,
    });
  } catch (error) {
    logError("Pipeline error", error);
    return NextResponse.json(
      {
        error: "Analysis failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
