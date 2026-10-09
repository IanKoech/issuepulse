import { handleTeam } from "@/lib/monitoring";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ team: string }> },
) {
  return handleTeam(request, (await params).team);
}
export const POST = GET;
