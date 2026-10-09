import { config } from "dotenv";
config({ path: ".env.local" });
config();
const { runChecks } = await import("../src/lib/checks");
const { db } = await import("../src/lib/db");
if (process.argv.includes("--watch")) {
  console.info("IssuePulse worker: checking due monitors every 60 seconds.");
  while (true) {
    try {
      console.info(`Checked ${await runChecks()} monitors.`);
    } catch (error) {
      console.error(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 60000));
  }
} else {
  try {
    console.info(`Checked ${await runChecks()} monitors.`);
  } finally {
    await db.end();
  }
}
