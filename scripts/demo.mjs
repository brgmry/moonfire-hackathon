// npm run demo: the fixture backend on :4000 and the frontend on :3000, pointed at it. No keys, no cloud, no cost.
// Ports in use? WEB_PORT=3100 API_PORT=4100 npm run demo
import { spawn } from "node:child_process";

const web = process.env.WEB_PORT ?? "3000", api = process.env.API_PORT ?? "4000";
const env = { ...process.env, NEXT_PUBLIC_API_URL: `http://localhost:${api}`, NEXT_PUBLIC_LIVE: "1" };
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (args, port) => spawn(npm, ["run", ...args, "-w", "frontend"], { env: { ...env, PORT: port }, stdio: "inherit", shell: process.platform === "win32" });
const kids = [run(["fixture"], api), run(["dev"], web)];
const stop = () => { for (const k of kids) k.kill(); process.exit(); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const k of kids) k.on("exit", stop);
console.log(`\n  README vs Reality, local demo: open http://localhost:${web} and paste any GitHub URL (it replays a recorded run)\n`);
