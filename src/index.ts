#!/usr/bin/env node

import { parse } from "@bomb.sh/args";

import { loadTsConfig } from "./config.js";
import { buildDependencyGraph } from "./graph.js";
import { determineMigrationOrder } from "./order.js";
import { formatMigrationReport } from "./report.js";

interface CliArgs {
  readonly _: Array<string | number | boolean>;
  readonly entry?: string[];
  readonly config?: string;
  readonly tsconfig?: string;
  readonly help?: boolean;
}

async function main(): Promise<void> {
  const args = parse(process.argv.slice(2), {
    alias: {
      c: "config",
      h: "help",
    },
    array: ["entry"],
    boolean: ["help"],
    string: ["config", "tsconfig"],
  }) as CliArgs;

  if (args.help) {
    console.log(helpText());
    return;
  }

  const positionalEntries = args._.map(String).filter(Boolean);
  const entryPoints = [...(args.entry ?? []), ...positionalEntries];

  if (entryPoints.length === 0) {
    throw new Error("Provide at least one entry point.\n\n" + helpText());
  }

  const cwd = process.cwd();
  const projectConfig = loadTsConfig(cwd, args.tsconfig ?? args.config);
  const graphResult = buildDependencyGraph(entryPoints, projectConfig, cwd);
  const plan = determineMigrationOrder(graphResult.graph);

  console.log(
    formatMigrationReport({
      plan,
      manualReview: graphResult.manualReview,
      basePath: projectConfig.basePath,
    }),
  );
}

function helpText(): string {
  return `Usage:
  ts-analyze [options] <entry...>

Options:
  --entry <file>        Entry point. May be passed multiple times.
  --config, -c <file>   Path to tsconfig.json. Defaults to nearest tsconfig.
  --tsconfig <file>     Alias for --config.
  --help, -h            Show this help message.

Examples:
  ts-analyze src/index.js
  ts-analyze --config tsconfig.json --entry src/index.js --entry src/admin.js`;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
