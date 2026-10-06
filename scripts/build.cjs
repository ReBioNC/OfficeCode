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
    "src/sidecar/drivers.ts src/sidecar/runs.ts src/sidecar/server.ts src/sidecar/models.ts src/sidecar/queue.ts " +
    "src/dashboard/agent-motion.ts src/dashboard/studio-map.ts src/dashboard/live-agents.ts src/dashboard/layout.ts src/dashboard/sprites.ts src/dashboard/work-role.ts " +
    "test/office-store.test.ts test/ledgers.test.ts test/drivers.test.ts " +
    "test/task-summary.test.ts test/visual-preferences.test.ts test/agent-attention.test.ts test/activity-bubble.test.ts test/studio-interactions.test.ts test/result-transfers.test.ts test/activity-visuals.test.ts test/studio-workflow.test.ts test/studio-theme.test.ts test/studio-seating.test.ts test/agent-motion.test.ts test/live-agents.test.ts test/sprites.test.ts test/roles.test.ts test/models.test.ts test/queue.test.ts test/budgets.test.ts test/server-m2.test.ts test/commands.test.ts test/mirror.test.ts test/server-mirror.test.ts test/opencode-plugin.test.ts " +
    "test/runs.test.ts test/server.test.ts test/layout.test.ts test/xss-contract.test.ts " +
    "test/connection-status.test.ts test/panel-layout.test.ts test/studio-camera.test.ts test/agent-inspector.test.ts test/client-contract.test.ts test/server-lease.test.ts test/work-role.test.ts " +
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
