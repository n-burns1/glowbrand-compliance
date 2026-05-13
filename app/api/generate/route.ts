import { NextResponse } from "next/server";
import { generateText } from "@/lib/twelvelabs";

export async function POST(req: Request) {
  try {
    const { videoId, prompt } = await req.json();
    if (!videoId || !prompt)
      return NextResponse.json(
        { error: "videoId and prompt are required" },
        { status: 400 }
      );
    const data = await generateText(videoId, prompt);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
