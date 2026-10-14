import { it } from "node:test";
import assert from "node:assert/strict";
import { connectionStatus } from "../src/dashboard/connection-status.js";

it("distinguishes startup, stopped server, disconnected OpenCode, idle and stale snapshots", () => {
  const healthy = { server:true, stream:true, fresh:true, managed:true, leases:1, active:0, attempted:true };
  assert.equal(connectionStatus(healthy).text, "Agent runtime connected · idle");
  assert.equal(connectionStatus({...healthy, active:3}).text, "Live · 3 agents working");
  assert.equal(connectionStatus({...healthy, leases:0}).text, "Agent runtime disconnected");
  assert.equal(connectionStatus({...healthy, server:false}).text, "Server unavailable · reopen your agent app");
  assert.equal(connectionStatus({...healthy, attempted:false, server:false}).text, "Connecting…");
  assert.equal(connectionStatus({...healthy, fresh:false}).text, "Data out of sync · retrying");
  assert.equal(connectionStatus({...healthy, stream:false}).text, "Reconnecting live feed…");
});
