import { timingSafeEqual } from "node:crypto";
import { runChecks } from "@/lib/checks";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") || "");
  const target = Buffer.from(`Bearer ${expected}`);
  if (
    !expected ||
    supplied.length !== target.length ||
    !timingSafeEqual(supplied, target)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ checked: await runChecks() });
  } catch {
    return Response.json({ error: "Check batch failed" }, { status: 500 });
  }
}
