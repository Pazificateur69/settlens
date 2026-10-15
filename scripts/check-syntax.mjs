import { readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else if (/\.(?:js|mjs)$/.test(entry.name)) result.push(path);
  }
  return result;
}
const sources = (await Promise.all(["src", "demo", "test", "scripts", "site/src", "site/assets", "site/tools"].map(files))).flat();
sources.push("site/server.js", "site/build.js", "site/monitor-api.js");
for (const path of sources) execFileSync(process.execPath, ["--check", path], { stdio: "pipe" });
console.log(`Syntax OK: ${sources.length} JavaScript files.`);
