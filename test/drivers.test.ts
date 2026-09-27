import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MockDriver, CliDriver, selectDriver } from "../src/sidecar/drivers.js";

describe("MockDriver", () => {
  it("streams script chunks then done", async () => {
    const driver = new MockDriver(["hello ", "world"]);
    const chunks: string[] = [];
    const code = await driver.start("demo", (e) => {
      if (e.kind === "chunk") chunks.push(e.text ?? "");
    });
    assert.equal(code, 0);
    assert.equal(chunks.join(""), "hello world");
  });
});

describe("selectDriver", () => {
  it("uses mock when OFFICECODE_DRIVER=mock", () => {
    assert.equal(selectDriver({ OFFICECODE_DRIVER: "mock" }).name, "mock");
  });
  it("uses cli otherwise", () => {
    assert.equal(selectDriver({}).name, "cli");
  });
});

describe("CliDriver missing binary", () => {
  it("reports missing-cli instead of throwing", async () => {
    const driver = new CliDriver("__definitely_not_a_real_binary__", []);
    const seen: string[] = [];
    const code = await driver.start("hi", (e) => {
      if (e.kind === "error") seen.push(e.message);
    });
    assert.equal(code, 127);
    assert.match(seen.join(" "), /missing-cli/);
  });
});
