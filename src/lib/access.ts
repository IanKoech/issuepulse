import { auth } from "./auth";
import { db } from "./db";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function teamAccess(
  userId: string,
  teamId: string,
  manage = false,
) {
  const { rows } = await db.query(
    'SELECT role FROM member WHERE "userId"=$1 AND "organizationId"=$2',
    [userId, teamId],
  );
  if (!rows[0]) throw new ApiError(403, "You do not belong to this team.");
  if (manage && !["owner", "admin"].includes(rows[0].role))
    throw new ApiError(403, "An owner or admin is required.");
  return rows[0].role as string;
}
export async function requestAccess(
  request: Request,
  team: string,
  manage = false,
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !session.user.emailVerified)
    throw new ApiError(401, "Sign in with a verified account.");
  if (request.method !== "GET") {
    if (request.headers.get("origin") !== process.env.BETTER_AUTH_URL)
      throw new ApiError(403, "Invalid request origin.");
    const bucket = Math.floor(Date.now() / 60000);
    const { rows } = await db.query(
      `INSERT INTO write_limit(user_id,bucket,count) VALUES($1,$2,1) ON CONFLICT(user_id) DO UPDATE SET bucket=EXCLUDED.bucket,count=CASE WHEN write_limit.bucket=EXCLUDED.bucket THEN write_limit.count+1 ELSE 1 END RETURNING count`,
      [session.user.id, bucket],
    );
    if (rows[0].count > 60)
      throw new ApiError(429, "Too many requests. Try again in a minute.");
  }
  const role = await teamAccess(session.user.id, team, manage);
  return { user: session.user, role };
}
