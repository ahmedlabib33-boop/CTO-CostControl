import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
export const dynamic = "force-dynamic";
export async function GET() {
  const file = path.join(process.cwd(), "public", "generated", "portfolio", "latest.json");
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return NextResponse.json({ ok: true, registry_fingerprint: data.registry_fingerprint, generated_at: data.generated_at, project_count: data.project_count });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 503 });
  }
}
