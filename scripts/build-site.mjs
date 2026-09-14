// Copies the public site into dist/ for Cloudflare Pages.
//
// Pages publishes its whole output directory, so pointing it at the repo root
// would also serve api/, lib/, functions/, supabase/ migrations and
// node_modules as static files. Only what the browser needs goes in here.
// Server functions are picked up separately from functions/.
import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";

const PUBLIC = [
  "index.html", "messages.html", "profile.html", "reel.html", "request.html",
  "sw.js", "css", "js", "images"
];

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
for (const entry of PUBLIC) {
  if (!existsSync(entry)) throw new Error(`build-site: missing ${entry}`);
  cpSync(entry, `dist/${entry}`, { recursive: true });
}
console.log(`build-site: copied ${PUBLIC.length} entries to dist/`);
