import { it } from "node:test";
import assert from "node:assert/strict";
import { projectRows, projectLabel } from "../src/dashboard/project-switcher";
const origin = "http://127.0.0.1:8787";
it("keeps project names as text, disambiguates workspaces and normalizes the current row", () => {
  const rows = projectRows({ projects: [
    { name: "app <img>", workspace: "/a/app", url: origin, current: false },
    { name: "app", workspace: "/b/app", url: "http://127.0.0.1:9000", current: true },
  ] }, origin);
  assert.equal(rows[0].name, "app <img>"); assert.equal(rows[0].current, true);
  assert.equal(rows[1].current, false); assert.equal(rows[1].workspace, "/b/app");
});
it("puts a short unique parent path before long common workspace prefixes", () => {
  const rows = projectRows({ projects: [
    { name: "app", workspace: "/work/alpha/app", url: origin },
    { name: "app", workspace: "/work/beta/app", url: "http://127.0.0.1:9000" },
  ] }, origin);
  assert.equal(projectLabel(rows[0], rows), "app — alpha");
  assert.equal(projectLabel(rows[1], rows), "app — beta");
});
it("rejects external/script URLs, malformed entries and duplicate ports", () => {
  const rows = projectRows({ projects: [
    { name: "evil", workspace: "/evil", url: "https://example.com", current: false },
    { name: "bad", workspace: "/bad", url: "javascript:alert(1)", current: false },
    { name: "good", workspace: "/good", url: "http://127.0.0.1:9000", current: false },
    { name: "duplicate", workspace: "/other", url: "http://127.0.0.1:9000", current: false },
  ] }, origin);
  assert.equal(rows.length, 2); assert.equal(rows[0].current, true); assert.equal(rows[1].name, "good");
  assert.equal(projectRows({}, origin).length, 1);
  assert.equal(projectRows(null, "http://localhost:8787")[0].url, origin);
});
