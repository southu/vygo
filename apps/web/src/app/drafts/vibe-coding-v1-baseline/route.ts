import { NextResponse } from "next/server";
import { readDraftMarkdown } from "@/lib/drafts-source";

export const dynamic = "force-static";

export async function GET() {
  const content = readDraftMarkdown("vibe-coding-v1-baseline.md");
  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}
