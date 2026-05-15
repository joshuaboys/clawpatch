import { extname, join } from "node:path";
import { packageBins, packageScripts, readPackageJson } from "../detect.js";
import { pathExists } from "../fs.js";
import { normalize } from "./shared.js";
import { FeatureSeed } from "./types.js";

export async function nodeSeeds(root: string): Promise<FeatureSeed[]> {
  const pkg = await readPackageJson(root);
  const seeds: FeatureSeed[] = [];
  for (const [command, path] of Object.entries(packageBins(pkg))) {
    const entryPath = await resolvePackageBinEntry(root, path);
    seeds.push({
      title: `CLI command ${command}`,
      summary:
        entryPath === normalizePackagePath(path)
          ? `Package bin '${command}' at ${path}.`
          : `Package bin '${command}' at ${path}, source ${entryPath}.`,
      kind: "cli-command",
      source: "package-json-bin",
      confidence: "high",
      entryPath,
      symbol: null,
      route: null,
      command,
      tags: ["node", "cli"],
      trustBoundaries: ["user-input", "filesystem", "process-exec"],
    });
  }
  for (const [script, command] of Object.entries(packageScripts(pkg))) {
    if (!["start", "build", "test", "lint", "typecheck", "format"].includes(script)) {
      continue;
    }
    seeds.push({
      title: `Package script ${script}`,
      summary: `Package script '${script}': ${command}`,
      kind: script === "test" ? "test-suite" : "release",
      source: "package-json-script",
      confidence: "medium",
      entryPath: "package.json",
      symbol: script,
      route: null,
      command: script,
      tags: ["node", "package-script"],
      trustBoundaries: script === "test" ? [] : ["process-exec", "filesystem"],
    });
  }
  return seeds;
}

async function resolvePackageBinEntry(root: string, path: string): Promise<string> {
  const normalized = normalizePackagePath(path);
  const source = sourceCandidateForGeneratedBin(normalized);
  if (source === null) {
    return normalized;
  }
  return (await pathExists(join(root, source))) ? source : normalized;
}

function sourceCandidateForGeneratedBin(path: string): string | null {
  const match = /^(?:dist|build)\/(.+)$/u.exec(path);
  if (match === null) {
    return null;
  }
  const suffix = match[1];
  if (suffix === undefined) {
    return null;
  }
  const extension = extname(suffix);
  if (![".js", ".mjs", ".cjs"].includes(extension)) {
    return null;
  }
  return `src/${suffix.slice(0, -extension.length)}.ts`;
}

function normalizePackagePath(path: string): string {
  return normalize(path).replace(/^\.\//u, "");
}
