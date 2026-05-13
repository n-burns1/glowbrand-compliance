import { NextResponse } from "next/server";
import { uploadVideoTask, getTaskStatus } from "@/lib/twelvelabs";

export async function POST(req: Request) {
  try {
    const { indexId, videoUrl } = await req.json();
    const data = await uploadVideoTask(indexId, videoUrl);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get("taskId");
    if (!taskId)
      return NextResponse.json({ error: "taskId required" }, { status: 400 });
    const data = await getTaskStatus(taskId);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
