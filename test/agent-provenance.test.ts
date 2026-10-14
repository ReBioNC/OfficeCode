import { it } from "node:test";
import assert from "node:assert/strict";
import { agentProvenance, runtimeLabel } from "../src/dashboard/agent-provenance.js";

it("identifies explicit runtime without inferring provenance from role", () => {
  assert.equal(runtimeLabel({ runtime: "opencode", role: "hermes" }), "OpenCode");
  assert.equal(runtimeLabel({ runtime: "hermes", role: "build" }), "Hermes");
  assert.equal(runtimeLabel({ role: "opencode" }), "Unknown runtime");
  assert.equal(runtimeLabel({ runtime: "invented", role: "hermes" }), "Unknown runtime");
});

it("resolves actual workspace and original configured agent alongside the parent runtime", () => {
  const parent = { sessionId: "parent", runtime: "hermes", agent: "my-parent", role: "Coordinator", workspace: "/profile" };
  const child = { sessionId: "child", parentSessionId: "parent", runtime: "opencode", agent: "custom-builder", role: "Fullstack", workspace: "C:\\actual-child" };
  assert.deepEqual(agentProvenance(child, [parent, child]), {
    runtime: "OpenCode", agent: "custom-builder", workspace: "C:\\actual-child", parent: "Hermes · my-parent · parent",
  });
  assert.equal(agentProvenance(child, [{ ...parent, runtime: "opencode" }]).parent, "OpenCode · my-parent · parent");
});

it("keeps missing provenance and unobserved parents explicit without using studio workspace", () => {
  assert.deepEqual(agentProvenance({ role: "hermes", parentSessionId: "absent" }, []), {
    runtime: "Unknown runtime", agent: "hermes", workspace: "Not provided", parent: "Unknown runtime · absent (not observed)",
  });
  assert.deepEqual(agentProvenance(undefined, []), {
    runtime: "Unknown runtime", agent: "Not provided", workspace: "Not provided", parent: "Not provided",
  });
});

it("preserves custom names and workspace text for safe DOM text rendering", () => {
  const metadata = agentProvenance({ agent: "<img src=x onerror=alert(1)>", workspace: "<script>attack()</script>" }, []);
  assert.equal(metadata.agent, "<img src=x onerror=alert(1)>");
  assert.equal(metadata.workspace, "<script>attack()</script>");
});
