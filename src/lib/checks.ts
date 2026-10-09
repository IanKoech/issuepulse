import { randomUUID } from "node:crypto";
import { db } from "./db";
import { probe } from "./probe";
import { sendEmail } from "./email";
export async function runChecks() {
  const token = randomUUID();
  const { rows: monitors } = await db.query(
    `UPDATE monitor SET lease_until=NOW()+INTERVAL '2 minutes',lease_token=$1 WHERE id IN (SELECT id FROM monitor WHERE enabled AND next_check_at<=NOW() AND (lease_until IS NULL OR lease_until<NOW()) ORDER BY next_check_at LIMIT 10 FOR UPDATE SKIP LOCKED) RETURNING *`,
    [token],
  );
  const results = await Promise.all(
    monitors.map(async (monitor) => ({
      monitor,
      result: await probe(monitor.url),
    })),
  );
  for (const { monitor, result } of results) {
    const connection = await db.connect();
    try {
      await connection.query("BEGIN");
      const { rows: current } = await connection.query(
        "SELECT state FROM monitor WHERE id=$1 AND lease_token=$2 FOR UPDATE",
        [monitor.id, token],
      );
      if (!current.length) {
        await connection.query("ROLLBACK");
        continue;
      }
      await connection.query(
        "INSERT INTO monitor_check(id,monitor_id,state,response_ms,status_code,error) VALUES($1,$2,$3,$4,$5,$6)",
        [
          randomUUID(),
          monitor.id,
          result.state,
          result.response_ms,
          result.status_code,
          result.error,
        ],
      );
      const { rows: windows } = await connection.query(
        "SELECT id FROM maintenance WHERE monitor_id=$1 AND starts_at<=NOW() AND ends_at>NOW()",
        [monitor.id],
      );
      if (
        current[0].state !== result.state &&
        (result.state === "down" || current[0].state === "down") &&
        !windows.length
      ) {
        const { rows: users } = await connection.query(
          `SELECT u.email FROM member m JOIN "user" u ON u.id=m."userId" WHERE m."organizationId"=$1 AND m.role IN ('owner','admin') AND u."emailVerified"=TRUE`,
          [monitor.team_id],
        );
        for (const user of users)
          await connection.query(
            "INSERT INTO alert_outbox(id,monitor_id,recipient,subject,body) VALUES($1,$2,$3,$4,$5)",
            [
              randomUUID(),
              monitor.id,
              user.email,
              `${monitor.name} is ${result.state}`,
              `${monitor.name} is ${result.state}. ${result.error || `HTTP ${result.status_code}`}. Open ${process.env.BETTER_AUTH_URL}/dashboard`,
            ],
          );
      }
      await connection.query(
        "UPDATE monitor SET state=$1,next_check_at=NOW()+interval_seconds*INTERVAL '1 second',lease_until=NULL,lease_token=NULL WHERE id=$2",
        [result.state, monitor.id],
      );
      await connection.query("COMMIT");
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  }
  await flushAlerts();
  // Retain 30 days, matching the dashboard's reported window.
  await db.query(
    "DELETE FROM monitor_check WHERE checked_at<NOW()-INTERVAL '30 days'",
  );
  return monitors.length;
}
export async function flushAlerts() {
  const token = randomUUID();
  const { rows } = await db.query(
    `UPDATE alert_outbox SET lease_token=$1,lease_until=NOW()+INTERVAL '2 minutes',attempts=attempts+1 WHERE id IN (SELECT id FROM alert_outbox WHERE sent_at IS NULL AND attempts<5 AND (lease_until IS NULL OR lease_until<NOW()) ORDER BY created_at LIMIT 5 FOR UPDATE SKIP LOCKED) RETURNING *`,
    [token],
  );
  for (const alert of rows) {
    try {
      await sendEmail(alert.recipient, alert.subject, alert.body);
      await db.query(
        "UPDATE alert_outbox SET sent_at=NOW(),lease_until=NULL WHERE id=$1 AND lease_token=$2",
        [alert.id, token],
      );
    } catch {
      await db.query(
        "UPDATE alert_outbox SET lease_until=NOW()+INTERVAL '5 minutes' WHERE id=$1 AND lease_token=$2",
        [alert.id, token],
      );
    }
  }
}
