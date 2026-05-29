import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["src", "docs"];
const extensions = new Set([".ts", ".tsx", ".md", ".css"]);
const failures = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else if ([...extensions].some((ext) => path.endsWith(ext))) check(path);
  }
}

function check(path) {
  const content = readFileSync(path, "utf8");
  if (content.includes("\t")) failures.push(`${path}: contains tab indentation`);
  if (/try\s*{\s*(?:import|require)\b/s.test(content)) failures.push(`${path}: import wrapped in try/catch`);
}

for (const root of roots) walk(root);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Static lint checks passed.");
