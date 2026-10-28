// Starts `next dev` / `next start` on PORT (from .env*.local or the shell),
// falling forward to the next free port if it is taken.
// Usage: node scripts/next-launch.mjs <dev|start> [extra next args]
import { spawn } from "node:child_process";
import net from "node:net";
import nextEnv from "@next/env";

const [mode = "dev", ...extraArgs] = process.argv.slice(2);
if (mode !== "dev" && mode !== "start") {
  console.error(`Unknown mode "${mode}". Use "dev" or "start".`);
  process.exit(1);
}

nextEnv.loadEnvConfig(process.cwd(), mode === "dev");

const MAX_ATTEMPTS = 20;
const preferredPort = Number.parseInt(process.env.PORT ?? "3000", 10);
if (!Number.isInteger(preferredPort) || preferredPort < 1 || preferredPort > 65535) {
  console.error(`PORT must be an integer between 1 and 65535, got "${process.env.PORT}".`);
  process.exit(1);
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port);
  });
}

async function findFreePort(start) {
  for (let port = start; port < start + MAX_ATTEMPTS && port <= 65535; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port found in ${start}-${start + MAX_ATTEMPTS - 1}.`);
}

const port = await findFreePort(preferredPort);
if (port !== preferredPort) {
  console.log(`Port ${preferredPort} is in use, using ${port} instead.`);
}

const child = spawn("next", [mode, "--port", String(port), ...extraArgs], {
  stdio: "inherit",
  env: { ...process.env, PORT: String(port) },
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
