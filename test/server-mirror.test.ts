import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { startServer } from "../src/sidecar/server.js";

let base = "";
let close: () => Promise<void> = async () => {};
before(async () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "officecode-mirror-api-"));
  fs.mkdirSync(path.join(ws, ".officecode.sample"), { recursive: true });
  fs.copyFileSync(
    path.join(process.cwd(), ".officecode.sample", "office.json"),
    path.join(ws, ".officecode.sample", "office.json"),
  );
  process.env["OFFICECODE_DRIVER"] = "mock";
  const srv = await startServer(ws, 0);
  const addr = srv.server.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}`;
  close = srv.close;
});
after(async () => {
  delete process.env["OFFICECODE_DRIVER"];
  await close();
});

async function mirror(p: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${base}${p}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("mirror api", () => {
  it("round-trips explicit runtime, original agent and actual workspace through updates and history", async () => {
    const registration = await mirror("/api/mirror/session", { sessionId: "mixed-runtime", role: "qa-engineer", agent: "custom-auditor", runtime: "opencode", workspace: "C:\\projects\\actual-child", parentSessionId: "hermes-parent", prompt: "Verify feature" });
    assert.equal(registration.status, 201);
    const registered = registration.json["run"] as Record<string, unknown>;
    assert.equal(registered["runtime"], "opencode");
    assert.equal(registered["workspace"], "C:\\projects\\actual-child");
    assert.equal(registered["agent"], "custom-auditor");
    const update = await mirror("/api/mirror/session", { sessionId: "mixed-runtime", prompt: "Updated task" });
    const updated = update.json["run"] as Record<string, unknown>;
    assert.equal(updated["runtime"], "opencode");
    assert.equal(updated["workspace"], "C:\\projects\\actual-child");
    assert.equal(updated["agent"], "custom-auditor");
    assert.equal(updated["role"], "qa-engineer");
    await mirror("/api/mirror/session", { sessionId: "mixed-runtime", runtime: "hermes", workspace: "/actual/new-workspace" });
    await mirror("/api/mirror/finish", { sessionId: "mixed-runtime", outcome: "done" });
    const history = (await (await fetch(`${base}/api/runs/${registered["id"]}`)).json() as { run: Record<string, unknown> }).run;
    assert.equal(history["runtime"], "hermes");
    assert.equal(history["workspace"], "/actual/new-workspace");
    assert.equal(history["agent"], "custom-auditor");
  });
  it("rejects malformed provenance before creating or changing a mirror", async () => {
    for (const metadata of [{ runtime: "claude" }, { runtime: null }, { workspace: 42 }, { workspace: "x".repeat(4097) }, { workspace: "" }, { agent: 42 }, { agent: "x".repeat(49) }, { role: "x".repeat(49) }]) {
      assert.equal((await mirror("/api/mirror/session", { sessionId: "bad-provenance", ...metadata })).status, 400, JSON.stringify(metadata).slice(0, 80));
    }
    const legacy = await mirror("/api/mirror/session", { sessionId: "legacy-provenance", role: "hermes" });
    assert.equal((legacy.json["run"] as Record<string, unknown>)["runtime"], undefined);
    const valid = await mirror("/api/mirror/session", { sessionId: "max-workspace", runtime: "hermes", workspace: "x".repeat(4096) });
    assert.equal(valid.status, 201);
    assert.equal((await mirror("/api/mirror/session", { sessionId: "max-workspace", runtime: "invalid" })).status, 400);
    const detail = (await (await fetch(`${base}/api/runs/${(valid.json["run"] as Record<string, unknown>)["id"]}`)).json() as { run: Record<string, unknown> }).run;
    assert.equal(detail["runtime"], "hermes");
    await mirror("/api/mirror/finish", { sessionId: "legacy-provenance", outcome: "done" });
    await mirror("/api/mirror/finish", { sessionId: "max-workspace", outcome: "done" });
  });
  it("bounds long workflows while retaining the newest actions and completion", async () => {
    await mirror("/api/mirror/session",{sessionId:"long-workflow",prompt:"Long workflow"});
    for (let i=0;i<105;i++) await mirror("/api/mirror/event",{sessionId:"long-workflow",state:"acting",activity:"reading",detail:`Reading file ${i}`});
    const result=await mirror("/api/mirror/finish",{sessionId:"long-workflow",outcome:"done"});
    const run=result.json["run"] as {timeline:{detail:string;activity:string}[];historyTruncated:number};
    assert.equal(run.timeline.length,100);
    assert.equal(run.historyTruncated,7);
    assert.equal(run.timeline[0].detail,"Reading file 6");
    assert.equal(run.timeline[99].activity,"done");
  });
  it("validates parallel tool metadata and clears tools on completion", async () => {
    await mirror("/api/mirror/session", {sessionId:"tool-api",prompt:"Tool metadata"});
    assert.equal((await mirror("/api/mirror/event",{sessionId:"tool-api",state:"acting",activeTools:[42]})).status,400);
    assert.equal((await mirror("/api/mirror/event",{sessionId:"tool-api",state:"acting",toolResult:{outcome:"invented"}})).status,400);
    const tool={id:"call-a",name:"read",activity:"reading",detail:"Reading a.ts"};
    const update=await mirror("/api/mirror/event",{sessionId:"tool-api",state:"acting",activity:"reading",activeTools:[tool]});
    assert.deepEqual((update.json["run"] as {activeTools:unknown[]}).activeTools,[tool]);
    const finished=await mirror("/api/mirror/finish",{sessionId:"tool-api",outcome:"done"});
    assert.deepEqual((finished.json["run"] as {activeTools:unknown[]}).activeTools,[]);
  });
  it("keeps timestamped tool history after completion without duplicate idle snapshots", async () => {
    await mirror("/api/mirror/session", { sessionId: "timeline-api", prompt: "Timeline feature" });
    await mirror("/api/mirror/event", { sessionId: "timeline-api", state: "acting", activity: "reading", detail: "Reading app.ts" });
    await mirror("/api/mirror/event", { sessionId: "timeline-api", state: "acting", activity: "reading", detail: "Reading app.ts" });
    await mirror("/api/mirror/event", { sessionId: "timeline-api", state: "acting", activity: "editing", detail: "Editing app.ts" });
    const result = await mirror("/api/mirror/finish", { sessionId: "timeline-api", outcome: "done" });
    const run = result.json["run"] as { startedAt?: string; finishedAt?: string; timeline?: { at: string; activity: string }[] };
    assert.deepEqual(run.timeline?.map((entry) => entry.activity), ["arriving", "reading", "editing", "done"]);
    assert.ok(Number.isFinite(Date.parse(run.startedAt ?? "")));
    assert.ok(Date.parse(run.finishedAt ?? "") >= Date.parse(run.startedAt ?? ""));
    assert.ok(run.timeline?.every((entry) => Number.isFinite(Date.parse(entry.at))));
  });
  it("preserves real parent session metadata across registration updates", async () => {
    const reg = await mirror("/api/mirror/session", { sessionId: "child-meta", parentSessionId: "parent-meta", role: "qa-engineer", prompt: "Verify feature" });
    assert.equal((reg.json["run"] as { parentSessionId?: string }).parentSessionId, "parent-meta");
    const update = await mirror("/api/mirror/session", { sessionId: "child-meta", prompt: "Updated title" });
    assert.equal((update.json["run"] as { parentSessionId?: string }).parentSessionId, "parent-meta");
    assert.equal((await mirror("/api/mirror/session", { sessionId: "invalid-parent", parentSessionId: 42 })).status, 400);
  });
  it("registers, streams, and finishes an opencode session", async () => {
    const reg = await mirror("/api/mirror/session", { sessionId: "ses-a", role: "build", prompt: "make x" });
    assert.equal(reg.status, 201);
    assert.ok(Number.isFinite(Date.parse((await (await fetch(`${base}/api/health`)).json()).lastEventAt)));
    assert.equal((reg.json["run"] as { detail: string }).detail, "Setting up workspace");
    const deskId = (reg.json["run"] as { deskId: string }).deskId;
    assert.ok(deskId);
    const ev = await mirror("/api/mirror/event", { sessionId: "ses-a", state: "acting", message: "edit x" });
    assert.equal(ev.status, 200);
    assert.equal((ev.json["run"] as { state: string }).state, "acting");
    const fin = await mirror("/api/mirror/finish", { sessionId: "ses-a", outcome: "done" });
    assert.equal(fin.status, 200);
    assert.equal((fin.json["run"] as { detail: string }).detail, "Session complete");
    const office = (await (await fetch(`${base}/api/office`)).json()) as { occupants: Record<string, string> };
    assert.equal(deskId in office.occupants, false);
  });
  it("rejects unknown sessions and bad states", async () => {
    assert.equal((await mirror("/api/mirror/event", { sessionId: "ghost", state: "acting" })).status, 404);
    assert.equal((await mirror("/api/mirror/finish", { sessionId: "ghost", outcome: "done" })).status, 404);
    assert.equal((await mirror("/api/mirror/event", { sessionId: "ses-a", state: "flying" })).status, 400);
    assert.equal((await mirror("/api/mirror/session", {})).status, 400);
  });
});
