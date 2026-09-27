const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });

fs.mkdirSync(path.join(root, "dist-test"), { recursive: true });
fs.mkdirSync(path.join(root, "dashboard", "public"), { recursive: true });

run("npx tsc -p tsconfig.json");
run(
  "npx tsc src/shared/events.ts src/shared/office-schema.ts " +
    "src/sidecar/index.ts src/sidecar/office-store.ts src/sidecar/ledgers.ts " +
    "src/sidecar/drivers.ts src/sidecar/runs.ts src/sidecar/server.ts " +
    "src/dashboard/layout.ts " +
    "test/office-store.test.ts test/ledgers.test.ts test/drivers.test.ts " +
    "test/runs.test.ts test/server.test.ts test/layout.test.ts test/xss-contract.test.ts " +
    "test/client-contract.test.ts " +
    "--outDir dist-test --module commonjs --target ES2022 --moduleResolution node " +
    "--strict --sourceMap false --declaration false --types node --lib ES2022,DOM " +
    "--esModuleInterop true"
);
run("npx esbuild src/dashboard/app.ts --bundle --format=iife --target=es2020 --outfile=dashboard/public/app.js");
fs.copyFileSync(
  path.join(root, "src", "dashboard", "index.html"),
  path.join(root, "dashboard", "public", "index.html")
);
console.log("build ok");
