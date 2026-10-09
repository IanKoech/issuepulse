import assert from "node:assert/strict";
import { test } from "node:test";
import { isPublicAddress, monitorUrl, probe } from "../src/lib/probe";
test("checker blocks loopback, private, metadata, reserved and mapped IPv6 destinations", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  for (const ip of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])
    assert.equal(isPublicAddress(ip), true, ip);
});
test("URLs reject alternate protocols, credentials and ports", () => {
  for (const url of [
    "file:///etc/passwd",
    "ftp://example.com",
    "http://user:pass@example.com",
    "http://example.com:8080",
  ])
    assert.throws(() => monitorUrl(url));
  assert.equal(
    monitorUrl("https://example.com/path#fragment").href,
    "https://example.com/path",
  );
});
test("a blocked HTTP destination is never requested", async () => {
  const result = await probe("http://127.0.0.1");
  assert.equal(result.state, "down");
  assert.match(result.error!, /blocked/);
});
