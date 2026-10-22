import type { Finding, RunState } from "./types.js";

// Returns a drop reason, or null when the finding stands.
export function validateFinding(s: RunState, f: Finding): "file_not_in_repo" | "quote_not_found" | null {
  const files: string[] | undefined = s.profile.files;
  if (Array.isArray(files) && files.length > 0 && !files.includes(f.file)) return "file_not_in_repo";
  if (typeof f.quote !== "string" || f.quote.trim() === "" || f.quote.length > 600) return "quote_not_found";
  return null;
}
