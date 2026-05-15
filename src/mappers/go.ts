import { join } from "node:path";
import { pathExists } from "../fs.js";
import { packageKind, packageTrustBoundaries, walk } from "./shared.js";
import { FeatureSeed } from "./types.js";

export async function goSeeds(root: string): Promise<FeatureSeed[]> {
  if (!(await pathExists(join(root, "go.mod")))) {
    return [];
  }
  const seeds: FeatureSeed[] = [];
  const cmdFiles = (await walk(root, ["cmd"])).filter((file) =>
    /^cmd\/[^/]+\/main\.go$/u.test(file),
  );
  for (const file of cmdFiles) {
    const command = file.split("/").at(1) ?? "go-command";
    seeds.push({
      title: `Go command ${command}`,
      summary: `Go executable command at ${file}.`,
      kind: "cli-command",
      source: "go-cmd",
      confidence: "high",
      entryPath: file,
      symbol: "main",
      route: null,
      command,
      tags: ["go", "cli"],
      trustBoundaries: ["user-input", "filesystem", "process-exec", "network"],
    });
  }
  const internalFiles = (await walk(root, ["internal"])).filter(
    (file) => file.endsWith(".go") && !file.endsWith("_test.go"),
  );
  const packages = new Map<string, string[]>();
  for (const file of internalFiles) {
    const packageDir = file.split("/").slice(0, 2).join("/");
    const list = packages.get(packageDir) ?? [];
    list.push(file);
    packages.set(packageDir, list);
  }
  for (const [packageDir, files] of packages) {
    const name = packageDir.split("/").at(-1) ?? packageDir;
    seeds.push({
      title: `Go package ${name}`,
      summary: `Internal Go package ${packageDir}.`,
      kind: packageKind(name),
      source: "go-internal-package",
      confidence: "medium",
      entryPath: files[0] ?? packageDir,
      symbol: null,
      route: null,
      command: null,
      tags: ["go", "internal"],
      trustBoundaries: packageTrustBoundaries(name),
    });
  }
  return seeds;
}
