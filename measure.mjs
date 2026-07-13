// Runs tsc and tsgo with --extendedDiagnostics against the three probe
// configs and prints a comparison table.
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const bin = (name) => join(import.meta.dirname, "node_modules", ".bin", name);

const probes = [
  ["baseline (no imports)", "tsconfig.baseline.json"],
  ["subpath import (chats only)", "tsconfig.subpath.json"],
  ["barrel import (package root)", "tsconfig.barrel.json"],
];

function run(compiler, config) {
  const out = execFileSync(
    bin(compiler),
    ["--noEmit", "-p", config, "--extendedDiagnostics"],
    { encoding: "utf8", cwd: import.meta.dirname }
  );
  const grab = (label) => {
    const m = out.match(new RegExp(`^${label}:\\s+(.+)$`, "m"));
    return m ? m[1].trim() : "n/a";
  };
  // tsgo reports a single "Lines"; tsc splits it into "Lines of Library" /
  // "Lines of Definitions" / "Lines of TypeScript" / etc.
  const lines =
    grab("Lines") !== "n/a"
      ? grab("Lines")
      : String(
          [...out.matchAll(/^Lines of \w+:\s+(\d+)$/gm)].reduce(
            (sum, m) => sum + Number(m[1]),
            0
          )
        );
  const memoryRaw = grab("Memory used");
  const memoryK = memoryRaw.match(/^(\d+)K$/);
  const memory = memoryK
    ? `${(Number(memoryK[1]) / 1024).toFixed(1)} MB`
    : memoryRaw;

  return {
    files: grab("Files"),
    lines,
    symbols: grab("Symbols"),
    memory,
    totalTime: grab("Total time"),
  };
}

for (const compiler of ["tsgo", "tsc"]) {
  console.log(`\n=== ${compiler} ===`);
  const rows = [];
  for (const [label, config] of probes) {
    const r = run(compiler, config);
    rows.push({ probe: label, ...r });
  }
  console.table(rows);
}
