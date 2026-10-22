import { existsSync } from "node:fs";

// Local secrets live in backend/.env (gitignored). Imported first so every module sees them.
if (existsSync(".env")) process.loadEnvFile(".env");
