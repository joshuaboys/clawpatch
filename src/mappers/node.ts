import { packageBins, packageScripts, readPackageJson } from "../detect.js";
import { normalize } from "./shared.js";
import { FeatureSeed } from "./types.js";

export async function nodeSeeds(root: string): Promise<FeatureSeed[]> {
  const pkg = await readPackageJson(root);
  const seeds: FeatureSeed[] = [];
  for (const [command, path] of Object.entries(packageBins(pkg))) {
    seeds.push({
      title: `CLI command ${command}`,
      summary: `Package bin '${command}' at ${path}.`,
      kind: "cli-command",
      source: "package-json-bin",
      confidence: "high",
      entryPath: normalize(path),
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
