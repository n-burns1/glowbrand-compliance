import { NextResponse } from "next/server";
import { listIndexes, createIndex } from "@/lib/twelvelabs";

export async function GET() {
  try {
    const data = await listIndexes();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { name } = await req.json();
    const id = await createIndex();
    return NextResponse.json({ id, name }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
