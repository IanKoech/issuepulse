import { db } from "./db";
export async function getTeamMembership(userId: string, teamId: string) {
  const { rows } = await db.query(
    'SELECT role FROM member WHERE "userId"=$1 AND "organizationId"=$2',
    [userId, teamId],
  );
  return rows[0] || null;
}
