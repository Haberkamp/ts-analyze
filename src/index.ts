#!/usr/bin/env node

import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "@bomb.sh/args";

import { loadTsConfig } from "./config.js";
import { buildDependencyGraph } from "./graph.js";
import { determineMigrationOrder } from "./order.js";
import {
  findNonLeafTypeScriptFiles,
  formatMigrationReport,
  formatWhyReport,
} from "./report.js";
import type { ReportLimit } from "./report.js";

interface CliArgs {
  readonly _: Array<string | number | boolean>;
  readonly entry?: string[];
  readonly config?: string;
  readonly tsconfig?: string;
  readonly help?: boolean;
  readonly "dry-run"?: boolean;
  readonly "report-limit"?: string | number | boolean;
}

interface CliResult {
  readonly output: string;
  readonly exitCode: number;
}

export function runCli(argv = process.argv.slice(2), cwd = process.cwd()): string {
  return runCliCommand(argv, cwd).output;
}

export function runCliCommand(
  argv = process.argv.slice(2),
  cwd = process.cwd(),
): CliResult {
  const args = parse(argv, {
    alias: {
      c: "config",
      h: "help",
    },
    array: ["entry"],
    boolean: ["dry-run", "help", "no-report-limit"],
    string: ["config", "tsconfig"],
  }) as CliArgs;

  if (args.help) {
    return { output: helpText(), exitCode: 0 };
  }

  const positionalEntries = args._.map(String).filter(Boolean);
  if (positionalEntries[0] === "why") {
    return {
      output: runWhyCommand(positionalEntries.slice(1), args, cwd),
      exitCode: 0,
    };
  }

  const entryPoints = [...(args.entry ?? []), ...positionalEntries];

  if (entryPoints.length === 0) {
    throw new Error("Provide at least one entry point.\n\n" + helpText());
  }

  const projectConfig = loadTsConfig(cwd, args.tsconfig ?? args.config);
  const graphResult = buildDependencyGraph(entryPoints, projectConfig, cwd);
  const plan = determineMigrationOrder(graphResult.graph);
  const reportLimit = parseReportLimit(args);

  const output = formatMigrationReport({
    plan,
    graph: graphResult.graph,
    manualReview: graphResult.manualReview,
    basePath: projectConfig.basePath,
    reportLimit,
  });
  const hasNonLeafTypeScriptFile =
    findNonLeafTypeScriptFiles(graphResult.graph).length > 0;

  return {
    output,
    exitCode: !args["dry-run"] && hasNonLeafTypeScriptFile ? 1 : 0,
  };
}

function runWhyCommand(
  positionalEntries: string[],
  args: CliArgs,
  cwd: string,
): string {
  const [file] = positionalEntries;
  if (!file) {
    throw new Error("Provide a TypeScript file to explain.\n\n" + helpText());
  }

  const projectConfig = loadTsConfig(cwd, args.tsconfig ?? args.config);
  const graphResult = buildDependencyGraph([file], projectConfig, cwd);

  return formatWhyReport({
    file: [...graphResult.graph.keys()][0] ?? file,
    graph: graphResult.graph,
    basePath: projectConfig.basePath,
  });
}

async function main(): Promise<void> {
  const result = runCliCommand();
  console.log(result.output);
  process.exitCode = result.exitCode;
}

function helpText(): string {
  return `Usage:
  ts-analyze [options] <entry...>
  ts-analyze [options] why <file>

Options:
  --entry <file>        Entry point. May be passed multiple times.
  --config, -c <file>   Path to tsconfig.json. Defaults to nearest tsconfig.
  --tsconfig <file>     Alias for --config.
  --dry-run             Do not fail when non-leaf TypeScript files are reported.
  --report-limit <n>    Limit reports shown per section. Defaults to 10.
  --no-report-limit     Disable per-section report limits.
  --help, -h            Show this help message.

Examples:
  ts-analyze src/index.js
  ts-analyze --config tsconfig.json --entry src/index.js --entry src/admin.js
  ts-analyze --config tsconfig.json why src/greeting.ts`;
}

function parseReportLimit(args: CliArgs): ReportLimit | undefined {
  const value = args["report-limit"];
  if (value === undefined) {
    return undefined;
  }

  if (value === false) {
    return false;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error("--report-limit must be a non-negative number.");
  }

  return value;
}

export function isCliEntryPoint(
  entryPoint = process.argv[1],
  moduleUrl = import.meta.url,
): boolean {
  if (!entryPoint) {
    return false;
  }

  const modulePath = fileURLToPath(moduleUrl);

  return normalizeEntrypointPath(entryPoint) === normalizeEntrypointPath(modulePath);
}

function normalizeEntrypointPath(filePath: string): string {
  const resolvedPath = path.resolve(filePath);

  try {
    return realpathSync(resolvedPath);
  } catch {
    return resolvedPath;
  }
}

if (isCliEntryPoint()) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
