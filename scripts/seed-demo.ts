import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
config({ path: ".env.local" });
config();
const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 12)
  throw new Error("Set DEMO_PASSWORD to at least 12 characters.");
const { auth } = await import("../src/lib/auth");
const { db } = await import("../src/lib/db");
const seeder = betterAuth({
  ...auth.options,
  rateLimit: { enabled: false },
  emailVerification: {
    ...auth.options.emailVerification,
    sendVerificationEmail: async () => {},
  },
});
async function user(name: string, email: string) {
  const existing = await db.query('SELECT id FROM "user" WHERE email=$1', [
    email,
  ]);
  if (existing.rowCount) return existing.rows[0].id as string;
  const result = await seeder.api.signUpEmail({
    body: { name, email, password: password! },
  });
  await db.query('UPDATE "user" SET "emailVerified"=TRUE WHERE id=$1', [
    result.user.id,
  ]);
  return result.user.id;
}
try {
  const owner = await user("Ian Demo", "owner@issuepulse.demo");
  const teammate = await user("Amara Demo", "member@issuepulse.demo");
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(73502922)");
    let team = (
      await c.query("SELECT id FROM organization WHERE slug='issuepulse-demo'")
    ).rows[0]?.id;
    if (!team) {
      team = randomUUID();
      await c.query(
        "INSERT INTO organization(id,name,slug,\"createdAt\") VALUES($1,'Pulse Studio · Demo','issuepulse-demo',NOW())",
        [team],
      );
      await c.query(
        'INSERT INTO member(id,"organizationId","userId",role,"createdAt") VALUES($1,$2,$3,\'owner\',NOW())',
        [randomUUID(), team, owner],
      );
    }
    const owns = await c.query(
      'SELECT id FROM member WHERE "organizationId"=$1 AND "userId"=$2 AND role=\'owner\'',
      [team, owner],
    );
    if (!owns.rowCount)
      throw new Error("The demo team belongs to another account.");
    if (
      !(
        await c.query(
          'SELECT id FROM member WHERE "organizationId"=$1 AND "userId"=$2',
          [team, teammate],
        )
      ).rowCount
    )
      await c.query(
        'INSERT INTO member(id,"organizationId","userId",role,"createdAt") VALUES($1,$2,$3,\'member\',NOW())',
        [randomUUID(), team, teammate],
      );
    if (
      !(await c.query("SELECT id FROM monitor WHERE team_id=$1", [team]))
        .rowCount
    ) {
      for (const [index, name] of [
        "Production website",
        "Developer docs",
        "API gateway",
      ].entries()) {
        const id = randomUUID();
        await c.query(
          "INSERT INTO monitor(id,team_id,name,url,state,is_public) VALUES($1,$2,$3,'https://example.com','up',$4)",
          [id, team, name, index === 0],
        );
        for (let i = 0; i < 60; i++)
          await c.query(
            "INSERT INTO monitor_check(id,monitor_id,state,response_ms,status_code,checked_at) VALUES($1,$2,$3,$4,$5,NOW()-$6*INTERVAL '5 minutes')",
            [
              randomUUID(),
              id,
              index === 2 && i > 25 && i < 29 ? "down" : "up",
              120 + index * 55 + ((i * 17) % 140),
              index === 2 && i > 25 && i < 29 ? 503 : 200,
              60 - i,
            ],
          );
        if (index === 2) {
          const incident = randomUUID();
          await c.query(
            "INSERT INTO incident(id,team_id,monitor_id,title,severity,state,assignee_id,is_public,resolved_at) VALUES($1,$2,$3,'Elevated API errors · Demo','minor','resolved',$4,TRUE,NOW())",
            [incident, team, id, teammate],
          );
          await c.query(
            "INSERT INTO incident_update(id,incident_id,author_id,body,state) VALUES($1,$2,$3,'Demo incident: a configuration change restored service. This is sample data.','resolved')",
            [randomUUID(), incident, owner],
          );
        }
      }
      await c.query(
        "INSERT INTO status_page(team_id,slug,title,published) VALUES($1,'issuepulse-demo','Pulse Studio — Demo status',TRUE)",
        [team],
      );
    }
    await c.query("COMMIT");
    console.info(
      "Demo ready: owner@issuepulse.demo and member@issuepulse.demo. Use your configured DEMO_PASSWORD. History is synthetic demo data.",
    );
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
} finally {
  await db.end();
}
