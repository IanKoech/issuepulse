import { config } from "dotenv";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
config({ path: ".env.local" });
config();
const password = process.env.DEMO_PASSWORD;
if (!password) throw new Error("Set DEMO_PASSWORD and seed first.");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_BROWSER_PATH,
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:3002");
  await page.screenshot({
    path: "docs/screenshots/landing.png",
    fullPage: true,
    caret: "initial",
  });
  await page.goto("http://localhost:3002/register");
  await page.screenshot({
    path: "docs/screenshots/register.png",
    fullPage: true,
    caret: "initial",
  });
  await page.goto("http://localhost:3002/login");
  await page.getByLabel("Email address").fill("owner@issuepulse.demo");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await page
    .getByRole("heading", { name: "The pulse of your team." })
    .waitFor();
  assert.match(
    await page.locator("body").evaluate((e) => getComputedStyle(e).fontFamily),
    /Montserrat/,
  );
  await page.screenshot({
    path: "docs/screenshots/dashboard.png",
    fullPage: true,
    caret: "initial",
  });
  for (const tab of [
    "Monitors",
    "Incidents",
    "Team",
    "Maintenance",
    "Status page",
    "Settings",
  ]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await page
      .getByRole("heading", {
        name: tab === "Settings" ? "Make yourself at home." : tab,
        exact: true,
      })
      .waitFor();
    assert.equal(await page.locator("main").getByRole("alert").count(), 0);
  }
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.locator("body").evaluate((e) => e.scrollWidth <= innerWidth),
  );
  await page.screenshot({
    path: "docs/screenshots/mobile.png",
    fullPage: true,
    caret: "initial",
  });
  await page.goto("http://localhost:3002/status/issuepulse-demo");
  await page
    .getByRole("heading", { name: "Pulse Studio — Demo status" })
    .waitFor();
  assert.equal(
    await page.getByText("Developer docs", { exact: true }).count(),
    0,
  );
  assert.equal(await page.getByText("API gateway", { exact: true }).count(), 0);
  await page.screenshot({
    path: "docs/screenshots/status.png",
    fullPage: true,
    caret: "initial",
  });
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await member.goto("http://localhost:3002/login");
  await member.getByLabel("Email address").fill("member@issuepulse.demo");
  await member.getByLabel("Password", { exact: true }).fill(password);
  await member.getByRole("button", { name: "Sign in", exact: true }).click();
  await member.waitForURL("**/dashboard");
  assert.equal(
    await member
      .getByRole("button", { name: "Add monitor", exact: true })
      .count(),
    0,
  );
  await member.getByRole("button", { name: "Monitors", exact: true }).click();
  assert.equal(
    await member.getByRole("heading", { name: "Add a monitor" }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.info(
    "Browser checks passed: owner/member access, dashboard tabs, Montserrat, responsive layout, public privacy. Screenshots saved.",
  );
} finally {
  await browser.close();
}
