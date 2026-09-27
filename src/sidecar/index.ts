import { startServer } from "./server.js";

const port = Number(process.env["PORT"] ?? 8787);
const workspace = process.env["OFFICECODE_WS"] ?? process.cwd();

startServer(workspace, port)
  .then(() => console.log(`officecode sidecar on http://127.0.0.1:${port} ws=${workspace}`))
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
