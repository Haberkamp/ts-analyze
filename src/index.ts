#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import { parse } from "@bomb.sh/args";

import { loadTsConfig } from "./config.js";
import { buildDependencyGraph } from "./graph.js";
import { determineMigrationOrder } from "./order.js";
import { formatMigrationReport, formatWhyReport } from "./report.js";

interface CliArgs {
  readonly _: Array<string | number | boolean>;
  readonly entry?: string[];
  readonly config?: string;
  readonly tsconfig?: string;
  readonly help?: boolean;
}

export function runCli(argv = process.argv.slice(2), cwd = process.cwd()): string {
  const args = parse(argv, {
    alias: {
      c: "config",
      h: "help",
    },
    array: ["entry"],
    boolean: ["help"],
    string: ["config", "tsconfig"],
  }) as CliArgs;

  if (args.help) {
    return helpText();
  }

  const positionalEntries = args._.map(String).filter(Boolean);
  if (positionalEntries[0] === "why") {
    return runWhyCommand(positionalEntries.slice(1), args, cwd);
  }

  const entryPoints = [...(args.entry ?? []), ...positionalEntries];

  if (entryPoints.length === 0) {
    throw new Error("Provide at least one entry point.\n\n" + helpText());
  }

  const projectConfig = loadTsConfig(cwd, args.tsconfig ?? args.config);
  const graphResult = buildDependencyGraph(entryPoints, projectConfig, cwd);
  const plan = determineMigrationOrder(graphResult.graph);

  return formatMigrationReport({
    plan,
    graph: graphResult.graph,
    manualReview: graphResult.manualReview,
    basePath: projectConfig.basePath,
  });
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
  console.log(runCli());
}

function helpText(): string {
  return `Usage:
  ts-analyze [options] <entry...>
  ts-analyze [options] why <file>

Options:
  --entry <file>        Entry point. May be passed multiple times.
  --config, -c <file>   Path to tsconfig.json. Defaults to nearest tsconfig.
  --tsconfig <file>     Alias for --config.
  --help, -h            Show this help message.

Examples:
  ts-analyze src/index.js
  ts-analyze --config tsconfig.json --entry src/index.js --entry src/admin.js
  ts-analyze --config tsconfig.json why src/greeting.ts`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
