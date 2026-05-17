import { readFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { packageBins, packageScripts } from "../detect.js";
import { pathExists } from "../fs.js";
import { rubyDependencyNames, rubyGemspecPaths, stripRubyComments } from "../ruby.js";
import { partitionFileGroups } from "./grouping.js";
import {
  normalize,
  packageKind,
  packageTrustBoundaries,
  pathMatchesPrefix,
  walk,
} from "./shared.js";
import {
  packageRelativePath,
  projectContextFiles,
  projectDisplayName,
  projectTags,
  projectTargetCommand,
} from "./projects.js";
import type { NodePackageJson, NodeProjectInfo } from "./projects.js";
import type { WorkspaceTaskGraph } from "./task-graph.js";
import {
  FeatureSeed,
  MapperContext,
  SeedFileRef,
  SeedTestRef,
  suppressedTestCommandTag,
} from "./types.js";

type PackageInfo = NodeProjectInfo & {
  packageJsonPath: string;
  packageJson: NodePackageJson;
};

const sourceDirectories = ["src", "lib", "app", "pages", "scripts"] as const;
const testDirectories = ["test", "tests", "__tests__"] as const;
const sourceGroupMaxOwnedFiles = 12;
const sourceGroupMaxTests = 8;

export async function nodeSeeds(root: string, context: MapperContext): Promise<FeatureSeed[]> {
  const packages = context.projects.filter(hasNodePackage);
  const seeds: FeatureSeed[] = [];

  for (const info of packages) {
    seeds.push(...(await packageSeeds(root, info, context.taskGraph)));
    seeds.push(...(await sourceGroupSeeds(root, info, context.taskGraph)));
  }

  return seeds;
}

function hasNodePackage(project: NodeProjectInfo): project is PackageInfo {
  return project.packageJsonPath !== null && project.packageJson !== null;
}

async function packageSeeds(
  root: string,
  info: PackageInfo,
  taskGraph: WorkspaceTaskGraph,
): Promise<FeatureSeed[]> {
  const seeds: FeatureSeed[] = [];
  const packageName = projectDisplayName(info);
  const packageTags = ["node", "package", ...projectTags(info)];
  if (info.root !== ".") {
    packageTags.push("workspace");
  }
  const testCommand = projectTargetCommand(info, "test", taskGraph);
  if (testCommand === null) {
    packageTags.push(suppressedTestCommandTag);
  }

  const manifestSeed: FeatureSeed = {
    title: `Node package ${packageName}`,
    summary: `Node package manifest at ${info.packageJsonPath}.`,
    kind: packageKind(`${packageName} ${info.root}`),
    source: "node-package",
    confidence: "medium",
    entryPath: info.packageJsonPath,
    symbol: packageName,
    route: null,
    command: null,
    ownedFiles: [{ path: info.packageJsonPath, reason: "package manifest" }],
    contextFiles: (await projectContextFiles(root, info)).filter(
      (ref) => ref.path !== info.packageJsonPath,
    ),
    tags: packageTags,
    trustBoundaries: packageTrustBoundaries(`${packageName} ${info.root}`),
    skipNearbyTests: true,
  };

  for (const [command, path] of Object.entries(packageBins(info.packageJson))) {
    const entryPath = await resolvePackageBinEntry(root, info.root, path);
    seeds.push({
      title: `CLI command ${command}`,
      summary:
        entryPath === packageRelativePath(info.root, normalizePackagePath(path))
          ? `Package bin '${command}' at ${path}.`
          : `Package bin '${command}' at ${path}, source ${entryPath}.`,
      kind: "cli-command",
      source: "package-json-bin",
      confidence: "high",
      entryPath,
      symbol: null,
      route: null,
      command,
      tags: ["node", "cli", ...(testCommand === null ? [suppressedTestCommandTag] : [])],
      trustBoundaries: ["user-input", "filesystem", "process-exec"],
      ...(testCommand === undefined ? {} : { testCommand }),
    });
  }

  for (const [script, command] of Object.entries(packageScripts(info.packageJson))) {
    if (!["start", "build", "test", "lint", "typecheck", "format"].includes(script)) {
      continue;
    }
    seeds.push({
      title:
        info.root === "."
          ? `Package script ${script}`
          : `Package script ${script} (${packageName})`,
      summary:
        info.root === "."
          ? `Package script '${script}': ${command}`
          : `Package script '${script}' in ${info.packageJsonPath}: ${command}`,
      kind: script === "test" ? "test-suite" : "release",
      source: "package-json-script",
      confidence: "medium",
      entryPath: info.packageJsonPath,
      symbol: script,
      route: null,
      command: script,
      tags: [
        "node",
        "package-script",
        ...projectTags(info),
        ...(testCommand === null ? [suppressedTestCommandTag] : []),
      ],
      trustBoundaries: script === "test" ? [] : ["process-exec", "filesystem"],
      skipNearbyTests: true,
    });
  }

  seeds.push(manifestSeed);
  return seeds;
}

async function sourceGroupSeeds(
  root: string,
  info: PackageInfo,
  taskGraph: WorkspaceTaskGraph,
): Promise<FeatureSeed[]> {
  const packageName = projectDisplayName(info);
  const testCommand = projectTargetCommand(info, "test", taskGraph);
  const testFiles = await packageTestFiles(root, info);
  const railsPackage = await isRailsPackage(root, info.root);
  const seeds: FeatureSeed[] = [];

  for (const sourceRoot of packageSourceRoots(info, railsPackage)) {
    if (!(await pathExists(join(root, sourceRoot)))) {
      continue;
    }
    const files = (await walk(root, [sourceRoot])).filter(
      (path) =>
        isReviewableNodeSourceFile(path) &&
        !isRailsExcludedNodeSourcePath(info, railsPackage, sourceRoot, path),
    );
    if (files.length === 0) {
      continue;
    }
    for (const group of partitionFileGroups(sourceRoot, files, sourceGroupMaxOwnedFiles)) {
      const tests = associatedTests(group.files, testFiles, testCommand ?? null);
      seeds.push({
        title: `Node source ${group.label}`,
        summary:
          group.files.length === 1
            ? `Node/TypeScript source file ${group.files[0]}.`
            : `Node/TypeScript source group ${group.label} with ${group.files.length} files.`,
        kind: packageKind(`${packageName} ${group.label}`),
        source: "node-source-group",
        confidence: "medium",
        entryPath: info.packageJsonPath,
        symbol: group.label,
        route: null,
        command: null,
        ownedFiles: group.files.map((path) => ({
          path,
          reason: `source group ${group.label}`,
        })),
        contextFiles: uniqueFileRefs([
          { path: info.packageJsonPath, reason: "package manifest" },
          ...tests.map((test) => ({ path: test.path, reason: "associated test" })),
        ]),
        tests,
        tags: [
          "node",
          "typescript",
          "source-group",
          ...projectTags(info),
          ...(testCommand === null ? [suppressedTestCommandTag] : []),
        ],
        trustBoundaries: packageTrustBoundaries(`${packageName} ${group.label}`),
        ...(testCommand === undefined ? {} : { testCommand }),
        skipNearbyTests: true,
      });
    }
  }

  return seeds;
}

function packageSourceRoots(info: PackageInfo, railsPackage: boolean): string[] {
  if (railsPackage) {
    return [
      ...new Set(
        [...sourceDirectories, "app/javascript", "app/packs", "app/frontend"].map((dir) =>
          packageRelativePath(info.root, dir),
        ),
      ),
    ].filter((path) => !pathMatchesPrefix(path, packageRelativePath(info.root, "app/assets")));
  }
  return sourceDirectories.map((dir) => packageRelativePath(info.root, dir));
}

function isRailsExcludedNodeSourcePath(
  info: PackageInfo,
  railsPackage: boolean,
  sourceRoot: string,
  path: string,
): boolean {
  if (!railsPackage) {
    return false;
  }
  if (pathMatchesPrefix(path, packageRelativePath(info.root, "app/assets"))) {
    return true;
  }
  if (sourceRoot !== packageRelativePath(info.root, "app")) {
    return false;
  }
  return ["app/javascript", "app/packs", "app/frontend"].some((dir) =>
    pathMatchesPrefix(path, packageRelativePath(info.root, dir)),
  );
}

async function packageTestFiles(root: string, info: PackageInfo): Promise<string[]> {
  const railsPackage = await isRailsPackage(root, info.root);
  const prefixes = [
    ...packageSourceRoots(info, railsPackage),
    ...testDirectories.map((dir) => packageRelativePath(info.root, dir)),
  ];
  return (await walk(root, prefixes)).filter(isNodeTestPath).slice(0, 200);
}

async function isRailsPackage(root: string, packageRoot: string): Promise<boolean> {
  return (
    packageRoot === "." &&
    (await pathExists(join(root, "config/application.rb"))) &&
    (await hasRailsDependency(root))
  );
}

async function hasRailsDependency(root: string): Promise<boolean> {
  const chunks: string[] = [];
  for (const path of ["Gemfile", "gems.rb"]) {
    if (await pathExists(join(root, path))) {
      chunks.push(await readFile(join(root, path), "utf8"));
    }
  }
  for (const path of await rubyGemspecPaths(root)) {
    chunks.push(await readFile(join(root, path), "utf8"));
  }
  return rubyDependencyNames(stripRubyComments(chunks.join("\n"))).has("rails");
}

function associatedTests(files: string[], tests: string[], command: string | null): SeedTestRef[] {
  const fileStems = new Set(files.map((file) => basename(file).replace(/\.[^.]+$/u, "")));
  const dirs = new Set(files.map((file) => dirname(file)));
  return tests
    .filter((test) => {
      const testStem = basename(test).replace(/\.(test|spec)\.[^.]+$/u, "");
      return fileStems.has(testStem) || [...dirs].some((dir) => pathMatchesPrefix(test, dir));
    })
    .slice(0, sourceGroupMaxTests)
    .map((path) => ({ path, command }));
}

async function resolvePackageBinEntry(
  root: string,
  packageRoot: string,
  path: string,
): Promise<string> {
  const normalized = normalizePackagePath(path);
  const source = sourceCandidateForGeneratedBin(normalized);
  const candidate = packageRelativePath(packageRoot, source ?? normalized);
  if (source === null) {
    return candidate;
  }
  return (await pathExists(join(root, candidate)))
    ? candidate
    : packageRelativePath(packageRoot, normalized);
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

function isReviewableNodeSourceFile(path: string): boolean {
  return (
    /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/u.test(path) &&
    !isNodeTestPath(path) &&
    !/\.d\.[cm]?ts$/u.test(path) &&
    !/(^|\/)(__fixtures__|fixtures|testdata)(\/|$)/u.test(path) &&
    !/(^|\/)[^/]*(?:generated|\.gen)\.[^.]+$/iu.test(path)
  );
}

function isNodeTestPath(path: string): boolean {
  return /\.(test|spec)\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/u.test(path);
}

function uniqueFileRefs(refs: SeedFileRef[]): SeedFileRef[] {
  const seen = new Set<string>();
  const output: SeedFileRef[] = [];
  for (const ref of refs) {
    if (seen.has(ref.path)) {
      continue;
    }
    seen.add(ref.path);
    output.push(ref);
  }
  return output;
}
