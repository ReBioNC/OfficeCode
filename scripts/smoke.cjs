const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

async function main() {
  const mod = await import("../dist/src/sidecar/server.js");
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "officecode-smoke-"));
  fs.mkdirSync(path.join(ws, ".officecode.sample"), { recursive: true });
  fs.copyFileSync(
    path.join(process.cwd(), ".officecode.sample", "office.json"),
    path.join(ws, ".officecode.sample", "office.json"),
  );
  process.env["OFFICECODE_DRIVER"] = "mock";
  const { server, close } = await mod.startServer(ws, 0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    const created = await (
      await fetch(`${base}/api/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deskId: "desk-fe-1", role: "frontend-dev", prompt: "smoke" }),
      })
    ).json();
    if (!created.run || created.run.state !== "done") throw new Error("run did not finish done");
    const manifest = path.join(ws, "output", "outbox", created.run.id, "manifest.json");
    if (!fs.existsSync(manifest)) throw new Error("missing outbox manifest");
    const ledger = fs.readFileSync(path.join(ws, ".officecode", "events.jsonl"), "utf8");
    if (!ledger.includes("run.finished")) throw new Error("ledger lacks run.finished proof");
    console.log(`smoke ok: ${created.run.id}`);
  } finally {
    delete process.env["OFFICECODE_DRIVER"];
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
