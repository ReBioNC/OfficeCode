import { it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

it("Hermes installation respects HERMES_HOME and preserves settings, other plugins and managed backups", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "office-hermes-install-"));
  const dir = path.join(home, "plugins/officecode");
  fs.mkdirSync(dir, { recursive: true });
  const settings = "model:\n  default: keep-my-model\nplugins:\n  enabled: [existing]\n";
  fs.writeFileSync(path.join(home, "config.yaml"), settings);
  fs.mkdirSync(path.join(home, "plugins/existing"));
  fs.writeFileSync(path.join(dir, "__init__.py"), "previous plugin");
  const install = () => execFileSync(process.execPath, ["scripts/install-hermes.cjs", "--no-enable"],
    { cwd: process.cwd(), env: { ...process.env, HERMES_HOME: home }, timeout: 10_000 });
  try {
    install();
    assert.equal(fs.readFileSync(path.join(home, "config.yaml"), "utf8"), settings);
    assert.equal(fs.readFileSync(path.join(dir, "__init__.py.bak"), "utf8"), "previous plugin");
    const config = JSON.parse(fs.readFileSync(path.join(dir, "office-dashboard.json"), "utf8"));
    assert.equal(config.root, process.cwd());
    assert.equal(config.node, process.execPath);
    assert.match(fs.readFileSync(path.join(dir, "plugin.yaml"), "utf8"), /name: officecode/);
    assert.equal(fs.existsSync(path.join(home, "plugins/existing")), true);
    install();
    assert.equal(fs.readFileSync(path.join(dir, "__init__.py.bak"), "utf8"), "previous plugin");
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
