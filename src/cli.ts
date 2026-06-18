#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  cleanLocksCommand,
  ciCommand,
  doctorCommand,
  fixCommand,
  initCommand,
  makeContext,
  mapCommand,
  reportCommand,
  revalidateCommand,
  reviewCommand,
  nextCommand,
  openPrCommand,
  showCommand,
  statusCommand,
  triageCommand,
} from "./app.js";
import { ClawpatchError } from "./errors.js";
import { GlobalOptions } from "./config.js";

const moduleRequire = createRequire(import.meta.url);

export async function main(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    printHelp(parsed.command);
    return;
  }
  if (parsed.version) {
    process.stdout.write(`${packageVersion()}\n`);
    return;
  }
  const context = await makeContext(parsed.global);
  const result = await dispatch(context, parsed.command, parsed.flags);
  writeResult(result, parsed.global);
}

async function dispatch(
  context: Awaited<ReturnType<typeof makeContext>>,
  command: string,
  flags: Record<string, string | boolean>,
): Promise<unknown> {
  switch (command) {
    case "init":
      return initCommand(context, flags);
    case "map":
      return mapCommand(context, flags);
    case "status":
      return statusCommand(context);
    case "review":
      return reviewCommand(context, flags);
    case "ci":
      return ciCommand(context, flags);
    case "report":
      return reportCommand(context, flags);
    case "show":
      return showCommand(context, flags);
    case "next":
      return nextCommand(context, flags);
    case "triage":
      return triageCommand(context, flags);
    case "fix":
      return fixCommand(context, flags);
    case "open-pr":
      return openPrCommand(context, flags);
    case "revalidate":
      return revalidateCommand(context, flags);
    case "doctor":
      return doctorCommand(context, flags);
    case "clean-locks":
      return cleanLocksCommand(context);
    default:
      throw new ClawpatchError(`unknown command: ${command}`, 2, "invalid-usage");
  }
}

type ParsedArgs = {
  command: string;
  flags: Record<string, string | boolean>;
  global: GlobalOptions;
  help: boolean;
  version: boolean;
};

export function parseArgs(argv: string[]): ParsedArgs {
  const global: GlobalOptions = {
    json: false,
    plain: false,
    quiet: false,
    verbose: false,
    debug: false,
    noColor: false,
    noInput: false,
  };
  const flags: Record<string, string | boolean> = {};
  let command = "";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      continue;
    }
    if (command === "" && !arg.startsWith("-")) {
      command = arg;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      return { command, flags, global, help: true, version: false };
    }
    if (arg === "--version") {
      return { command, flags, global, help: false, version: true };
    }
    const longName = arg.startsWith("--") ? arg.slice(2) : "";
    const longOption = optionSpecs[longName];
    if (longOption?.kind === "value") {
      const next = readFlagValue(argv, index, arg);
      index += 1;
      setOption(global, flags, longOption, next);
      continue;
    }
    if (longOption?.kind === "boolean") {
      setOption(global, flags, longOption, true);
      continue;
    }
    const shortOption = shortOptionSpecs[arg];
    if (shortOption !== undefined) {
      const value = shortOption.kind === "value" ? readFlagValue(argv, index, arg) : true;
      if (shortOption.kind === "value") {
        index += 1;
      }
      setOption(global, flags, shortOption, value);
      continue;
    }
    throw new ClawpatchError(`unknown arg: ${arg}`, 2, "invalid-usage");
  }
  if (command === "") {
    command = "status";
  }
  validateCommandFlags(command, flags);
  validateCommandRequirements(command, flags);
  return { command, flags, global, help: false, version: false };
}

const commandFlags = {
  init: new Set(["force"]),
  map: new Set(["dryRun", "source", "provider", "model", "reasoningEffort", "skipGitRepoCheck"]),
  status: new Set<string>(),
  review: new Set([
    "feature",
    "featureList",
    "project",
    "limit",
    "since",
    "jobs",
    "mode",
    "rateLimitPerMinute",
    "provider",
    "model",
    "reasoningEffort",
    "skipGitRepoCheck",
    "dryRun",
    "promptFile",
    "exportTribunalLedger",
    "includeDirty",
    "noRegistryVerify",
  ]),
  ci: new Set([
    "limit",
    "since",
    "jobs",
    "rateLimitPerMinute",
    "provider",
    "model",
    "reasoningEffort",
    "skipGitRepoCheck",
    "output",
    "includeDirty",
    "noRegistryVerify",
  ]),
  report: new Set(["status", "severity", "feature", "project", "category", "triage", "output"]),
  show: new Set(["finding"]),
  next: new Set(["status", "project"]),
  triage: new Set(["finding", "status", "note"]),
  fix: new Set(["finding", "provider", "model", "reasoningEffort", "skipGitRepoCheck", "dryRun"]),
  "open-pr": new Set(["patch", "base", "branch", "title", "draft", "dryRun", "force"]),
  revalidate: new Set([
    "finding",
    "all",
    "status",
    "severity",
    "feature",
    "category",
    "triage",
    "limit",
    "since",
    "provider",
    "model",
    "reasoningEffort",
    "skipGitRepoCheck",
    "includeDirty",
  ]),
  doctor: new Set(["provider", "model", "reasoningEffort"]),
  "clean-locks": new Set<string>(),
} satisfies Record<string, Set<string>>;

const requiredCommandFlags: Partial<Record<keyof typeof commandFlags, string[]>> = {
  show: ["finding"],
  triage: ["finding", "status"],
  fix: ["finding"],
  "open-pr": ["patch"],
};

type OptionSpec = {
  name: string;
  kind: "value" | "boolean";
  target: "global" | "command";
};

const optionSpecs: Record<string, OptionSpec> = {
  root: { name: "root", kind: "value", target: "global" },
  "state-dir": { name: "stateDir", kind: "value", target: "global" },
  config: { name: "config", kind: "value", target: "global" },
  json: { name: "json", kind: "boolean", target: "global" },
  plain: { name: "plain", kind: "boolean", target: "global" },
  quiet: { name: "quiet", kind: "boolean", target: "global" },
  verbose: { name: "verbose", kind: "boolean", target: "global" },
  debug: { name: "debug", kind: "boolean", target: "global" },
  "no-color": { name: "noColor", kind: "boolean", target: "global" },
  "no-input": { name: "noInput", kind: "boolean", target: "global" },
  feature: { name: "feature", kind: "value", target: "command" },
  "feature-list": { name: "featureList", kind: "value", target: "command" },
  finding: { name: "finding", kind: "value", target: "command" },
  limit: { name: "limit", kind: "value", target: "command" },
  since: { name: "since", kind: "value", target: "command" },
  jobs: { name: "jobs", kind: "value", target: "command" },
  mode: { name: "mode", kind: "value", target: "command" },
  "rate-limit-per-minute": {
    name: "rateLimitPerMinute",
    kind: "value",
    target: "command",
  },
  source: { name: "source", kind: "value", target: "command" },
  provider: { name: "provider", kind: "value", target: "command" },
  model: { name: "model", kind: "value", target: "command" },
  "reasoning-effort": { name: "reasoningEffort", kind: "value", target: "command" },
  "prompt-file": { name: "promptFile", kind: "value", target: "command" },
  "export-tribunal-ledger": {
    name: "exportTribunalLedger",
    kind: "value",
    target: "command",
  },
  output: { name: "output", kind: "value", target: "command" },
  status: { name: "status", kind: "value", target: "command" },
  severity: { name: "severity", kind: "value", target: "command" },
  category: { name: "category", kind: "value", target: "command" },
  triage: { name: "triage", kind: "value", target: "command" },
  project: { name: "project", kind: "value", target: "command" },
  note: { name: "note", kind: "value", target: "command" },
  patch: { name: "patch", kind: "value", target: "command" },
  base: { name: "base", kind: "value", target: "command" },
  branch: { name: "branch", kind: "value", target: "command" },
  title: { name: "title", kind: "value", target: "command" },
  "dry-run": { name: "dryRun", kind: "boolean", target: "command" },
  "skip-git-repo-check": {
    name: "skipGitRepoCheck",
    kind: "boolean",
    target: "command",
  },
  force: { name: "force", kind: "boolean", target: "command" },
  all: { name: "all", kind: "boolean", target: "command" },
  draft: { name: "draft", kind: "boolean", target: "command" },
  "include-dirty": { name: "includeDirty", kind: "boolean", target: "command" },
  "no-registry-verify": {
    name: "noRegistryVerify",
    kind: "boolean",
    target: "command",
  },
};

const shortOptionSpecs: Record<string, OptionSpec> = {
  "-q": optionSpecs["quiet"]!,
  "-v": optionSpecs["verbose"]!,
  "-o": optionSpecs["output"]!,
};

const shortFlagNames = new Set(["-h", ...Object.keys(shortOptionSpecs)]);

export function packageVersion(): string {
  const pkg = moduleRequire("../package.json") as { version?: unknown };
  return typeof pkg.version === "string" ? pkg.version : "0.0.0";
}

function validateCommandFlags(command: string, flags: Record<string, string | boolean>): void {
  if (!isKnownCommand(command)) {
    throw new ClawpatchError(`unknown command: ${command}`, 2, "invalid-usage");
  }
  const allowed = commandFlags[command];
  for (const flag of Object.keys(flags)) {
    if (!allowed.has(flag)) {
      throw new ClawpatchError(
        `unsupported flag for ${command}: --${kebab(flag)}`,
        2,
        "invalid-usage",
      );
    }
  }
}

function validateCommandRequirements(
  command: string,
  flags: Record<string, string | boolean>,
): void {
  if (!isKnownCommand(command)) {
    throw new ClawpatchError(`unknown command: ${command}`, 2, "invalid-usage");
  }
  const required = requiredCommandFlags[command] ?? [];
  for (const flag of required) {
    if (typeof flags[flag] !== "string" || flags[flag].length === 0) {
      throw new ClawpatchError(`missing --${kebab(flag)}`, 2, "invalid-usage");
    }
  }
  if (
    command === "revalidate" &&
    typeof flags["finding"] !== "string" &&
    flags["all"] !== true &&
    typeof flags["since"] !== "string" &&
    flags["includeDirty"] !== true
  ) {
    throw new ClawpatchError("missing --finding or --all", 2, "invalid-usage");
  }
  if (
    command === "review" &&
    typeof flags["mode"] === "string" &&
    flags["mode"] !== "default" &&
    flags["mode"] !== "deslopify"
  ) {
    throw new ClawpatchError("invalid --mode; expected default or deslopify", 2, "invalid-usage");
  }
  if (command === "review" && typeof flags["featureList"] === "string") {
    for (const conflictingFlag of ["feature", "project", "since"] as const) {
      if (typeof flags[conflictingFlag] === "string") {
        throw new ClawpatchError(
          `--feature-list cannot be combined with --${kebab(conflictingFlag)}`,
          2,
          "invalid-usage",
        );
      }
    }
    if (flags["includeDirty"] === true) {
      throw new ClawpatchError(
        "--feature-list cannot be combined with --include-dirty",
        2,
        "invalid-usage",
      );
    }
  }
}

function isKnownCommand(command: string): command is keyof typeof commandFlags {
  return Object.hasOwn(commandFlags, command);
}

function readFlagValue(argv: string[], index: number, flag: string): string {
  const next = argv[index + 1];
  if (next === undefined || isKnownOptionToken(next)) {
    throw new ClawpatchError(`missing value for ${flag}`, 2, "invalid-usage");
  }
  return next;
}

function isKnownOptionToken(value: string): boolean {
  if (shortFlagNames.has(value)) {
    return true;
  }
  return value.startsWith("--");
}

function setOption(
  global: GlobalOptions,
  flags: Record<string, string | boolean>,
  option: OptionSpec,
  value: string | boolean,
): void {
  if (option.target === "global") {
    const target = global as Record<string, string | boolean | undefined>;
    target[option.name] = value;
    return;
  }
  flags[option.name] = value;
}

function kebab(value: string): string {
  return value.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
}

function writeResult(result: unknown, options: GlobalOptions): void {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (
    typeof result === "object" &&
    result !== null &&
    "markdown" in result &&
    typeof result.markdown === "string" &&
    !options.plain
  ) {
    process.stdout.write(result.markdown);
    return;
  }
  if (typeof result === "object" && result !== null) {
    for (const [key, value] of Object.entries(result)) {
      if (key === "project" && typeof value === "object") {
        continue;
      }
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null
      ) {
        process.stdout.write(`${key}: ${String(value)}\n`);
      }
    }
    return;
  }
  process.stdout.write(`${String(result)}\n`);
}

function printHelp(command = ""): void {
  if (command === "review") {
    process.stdout.write(`clawpatch review

Usage:
  clawpatch review [flags]

Flags:
  --feature <id>
  --feature-list <path>
  --project <name-or-root>
  --limit <n>
  --since <ref>
  --include-dirty
  --jobs <n>        default: ~half of CPU cores, max 10
  --mode <default|deslopify>
  --rate-limit-per-minute <n>   cap provider calls per 60s window (env: CLAWPATCH_RPM)
  --provider <name>
  --model <name>
  --reasoning-effort <none|minimal|low|medium|high|xhigh>
  --skip-git-repo-check
  --dry-run
  --prompt-file <path>    appends extra reviewer guidance to the prompt;
                          use "-" to read from stdin
  --export-tribunal-ledger <path>
                          after the review completes, emit a single
                          JSONL file with one line per finding shaped
                          for downstream Tribunal-style signed-ledger
                          ingest. Opt-in; no effect when omitted.
  --no-registry-verify    disable a configured npm-registry post-validator that
                          drops findings whose "package X@Y is
                          unpublished" claim is refuted by the registry.
                          Set registryVerifier.enabled=true in config.json
                          to opt in; this flag disables it for one run.
  --json
  -q, --quiet
`);
    return;
  }
  if (command === "report") {
    process.stdout.write(`clawpatch report

Usage:
  clawpatch report [flags]

Flags:
  --status <status>
  --severity <severity>
  --feature <id>
  --project <name-or-root>
  --category <category>
  --triage <triage>
  --output <path>
  --json
`);
    return;
  }
  if (command === "ci") {
    process.stdout.write(`clawpatch ci

Usage:
  clawpatch ci [flags]

Flags:
  --since <ref>
  --include-dirty
  --limit <n>
  --jobs <n>        default: ~half of CPU cores, max 10
  --rate-limit-per-minute <n>   cap provider calls per 60s window (env: CLAWPATCH_RPM)
  --provider <name>
  --model <name>
  --reasoning-effort <none|minimal|low|medium|high|xhigh>
  --skip-git-repo-check
  --output <path>
  --no-registry-verify    see clawpatch review --help for details
  --json
`);
    return;
  }
  if (command === "show") {
    process.stdout.write(`clawpatch show

Usage:
  clawpatch show --finding <id> [flags]

Flags:
  --finding <id>
  --json
`);
    return;
  }
  if (command === "next") {
    process.stdout.write(`clawpatch next

Usage:
  clawpatch next [flags]

Flags:
  --status <status>  default: open
  --project <name-or-root>
  --json
`);
    return;
  }
  if (command === "triage") {
    process.stdout.write(`clawpatch triage

Usage:
  clawpatch triage --finding <id> --status <status> [flags]

Flags:
  --finding <id>
  --status <open|false-positive|fixed|wont-fix|uncertain>
  --note <text>
  --json
`);
    return;
  }
  if (command === "fix") {
    process.stdout.write(`clawpatch fix

Usage:
  clawpatch fix --finding <id> [flags]

Flags:
  --finding <id>
  --provider <name>
  --model <name>
  --reasoning-effort <none|minimal|low|medium|high|xhigh>
  --skip-git-repo-check
  --dry-run
  --json
`);
    return;
  }
  if (command === "open-pr") {
    process.stdout.write(`clawpatch open-pr

Usage:
  clawpatch open-pr --patch <id> [flags]

Flags:
  --patch <id>
  --base <branch>
  --branch <branch>
  --title <title>
  --draft
  --dry-run
  --force
  --json
`);
    return;
  }
  if (command === "init") {
    process.stdout.write(`clawpatch init

Usage:
  clawpatch init [flags]

Flags:
  --force
  --json
`);
    return;
  }
  if (command === "map") {
    process.stdout.write(`clawpatch map

Usage:
  clawpatch map [flags]

Flags:
  --source <heuristic|auto|agent>
  --provider <name>
  --model <name>
  --reasoning-effort <none|minimal|low|medium|high|xhigh>
  --skip-git-repo-check
  --dry-run
  --json
`);
    return;
  }
  if (command === "revalidate") {
    process.stdout.write(`clawpatch revalidate

Usage:
  clawpatch revalidate --finding <id> [flags]
  clawpatch revalidate --since <ref> [flags]

Flags:
  --finding <id>
  --all
  --status <status>
  --severity <severity>
  --feature <id>
  --category <category>
  --triage <triage>
  --limit <n>
  --since <ref>
  --include-dirty
  --provider <name>
  --model <name>
  --reasoning-effort <none|minimal|low|medium|high|xhigh>
  --skip-git-repo-check
  --json
`);
    return;
  }
  if (command === "status") {
    process.stdout.write(`clawpatch status

Usage:
  clawpatch status [flags]

Flags:
  --json
`);
    return;
  }
  if (command === "doctor") {
    process.stdout.write(`clawpatch doctor

Usage:
  clawpatch doctor [flags]

Flags:
  --provider <name>
  --model <name>
  --reasoning-effort <none|minimal|low|medium|high|xhigh>
  --json
`);
    return;
  }
  if (command === "clean-locks") {
    process.stdout.write(`clawpatch clean-locks

Usage:
  clawpatch clean-locks [flags]

Flags:
  --json
`);
    return;
  }
  process.stdout.write(`clawpatch: automated code review that lands fixes

Usage:
  clawpatch [global flags] <command> [flags]

Commands:
  init
  map
  status
  review
  ci
  report
  show
  next
  triage
  fix
  open-pr
  revalidate
  doctor
  clean-locks

Global flags:
  --root <path>
  --state-dir <path>
  --config <path>
  --json
  --plain
  -q, --quiet
  -v, --verbose
  --debug
  --no-color
  --no-input
  -h, --help
  --version
`);
}

if (isMainModule()) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    if (error instanceof ClawpatchError) {
      process.stderr.write(`error: ${error.message}\n`);
      process.exitCode = error.exitCode;
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`error: ${message}\n`);
    process.exitCode = 1;
  });
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  return import.meta.url === pathToFileURL(realpathSync(entry)).href;
}
