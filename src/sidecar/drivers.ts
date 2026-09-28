import { spawn } from "node:child_process";

export type DriverChunk =
  | { kind: "chunk"; text: string }
  | { kind: "done"; code: number }
  | { kind: "error"; message: string };

export interface Driver {
  name: string;
  start(prompt: string, onEvent: (e: DriverChunk) => void): Promise<number>;
}

export class MockDriver implements Driver {
  name = "mock";
  constructor(private script: string[] = ["Working on it... ", "done."]) {}
  async start(_prompt: string, onEvent: (e: DriverChunk) => void): Promise<number> {
    void _prompt;
    for (const text of this.script) {
      await new Promise((r) => setTimeout(r, 5));
      onEvent({ kind: "chunk", text });
    }
    onEvent({ kind: "done", code: 0 });
    return 0;
  }
}

export class CliDriver implements Driver {
  name = "cli";
  constructor(private command = "opencode", private args: string[] = ["run"]) {}
  start(prompt: string, onEvent: (e: DriverChunk) => void): Promise<number> {
    return new Promise((resolve) => {
      let child;
      try {
        child = spawn(this.command, [...this.args, prompt], { shell: false });
      } catch (err) {
        onEvent({ kind: "error", message: `missing-cli: ${(err as Error).message}` });
        resolve(127);
        return;
      }
      child.on("error", (err: Error) => {
        const code = (err as NodeJS.ErrnoException).code;
        const missing =
          code === "ENOENT"
            ? "missing-cli: opencode not found on PATH. Install OpenCode or set OFFICECODE_DRIVER=mock."
            : err.message;
        onEvent({ kind: "error", message: missing });
        resolve(127);
      });
      child.stdout?.on("data", (d: Buffer) => onEvent({ kind: "chunk", text: d.toString("utf8") }));
      child.stderr?.on("data", (d: Buffer) => onEvent({ kind: "chunk", text: d.toString("utf8") }));
      child.on("close", (exitCode: number | null) => {
        const code = exitCode ?? 1;
        onEvent({ kind: "done", code });
        resolve(code);
      });
    });
  }
}

export function selectDriver(env: Record<string, string | undefined>): Driver {
  if (env["OFFICECODE_DRIVER"] === "mock") return new MockDriver();
  return new CliDriver();
}
