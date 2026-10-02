import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { displayWorkRole, resolveWorkRole } from "../src/dashboard/work-role.js";

describe("displayWorkRole", () => {
  it("keeps explicit and custom roles ahead of task guesses, even with one agent", () => {
    assert.equal(displayWorkRole({role:"qa-engineer",prompt:"Edit frontend"},true), "QA");
    assert.equal(displayWorkRole({role:"release-manager",prompt:"Review frontend"},false), "Release Manager");
    assert.deepEqual(resolveWorkRole({role:"build",prompt:"Preview account feature"},false), {label:"Developer",source:"default"});
    assert.equal(displayWorkRole({role:"build",prompt:"Read service.ts"},false), "Developer");
    assert.deepEqual(resolveWorkRole({role:"build",prompt:"Edit React component"},false), {label:"Frontend",source:"inferred"});
    assert.deepEqual(resolveWorkRole({role:"build",prompt:"Any task"},true), {label:"Fullstack",source:"single-agent"});
  });
  it("names a single visible OpenCode agent Fullstack", () => {
    assert.equal(displayWorkRole({ role: "opencode", prompt: "Menguji API" }, true), "Fullstack");
  });

  it("uses specific OpenCode agent roles before task hints", () => {
    assert.equal(displayWorkRole({ role: "frontend-dev", prompt: "Review komponen" }, false), "Frontend");
    assert.equal(displayWorkRole({ role: "backend-dev", prompt: "Membuat endpoint" }, false), "Backend");
    assert.equal(displayWorkRole({ role: "reviewer", prompt: "Membaca kode" }, false), "Auditor");
    assert.equal(displayWorkRole({ role: "qa-engineer", prompt: "Uji fitur" }, false), "QA");
  });

  it("infers generic agents from their task without a model call", () => {
    assert.equal(displayWorkRole({ role: "build", prompt: "Membuat komponen React" }, false), "Frontend");
    assert.equal(displayWorkRole({ role: "build", prompt: "Membuat endpoint server" }, false), "Backend");
    assert.equal(displayWorkRole({ role: "opencode", prompt: "Audit keamanan" }, false), "Auditor");
    assert.equal(displayWorkRole({ role: "build", prompt: "Membangun frontend dan backend" }, false), "Fullstack");
  });

  it("keeps unknown custom agent names recognizable", () => {
    assert.equal(displayWorkRole({ role: "release-manager", prompt: "Koordinasi" }, false), "Release Manager");
  });
});
