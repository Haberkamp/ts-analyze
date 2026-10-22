import { parseArgs } from "node:util";

import { UsageError } from "../../application/ports.js";
import { createApplication } from "../../composition-root.js";
import { renderHumanReport, renderInspection } from "./human-report.js";
import { renderJsonInspection, renderJsonReport } from "./json-report.js";

export interface CliEnvironment {
  readonly cwd: string;
  /** Emit ANSI colors and terminal hyperlinks. */
  readonly color: boolean;
}

export interface CliResult {
  /** 0: no mixed branches (or --dry-run), 1: mixed branches found, 2: usage or config error. */
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

const DEFAULT_REPORT_LIMIT = 10;

export const HELP = `Usage:
  ts-analyze [options] <entry...>
  ts-analyze inspect [options] <file>

Plans a JavaScript to TypeScript migration. Migrate leaves first: a TypeScript
file that imports JavaScript (a "mixed branch") is an error.

Commands:
  ts-analyze <entry...>
    Project report: every JavaScript file reachable from the entries, in the
    order to migrate them, plus circular dependencies, mixed branches and a
    progress summary. Exits with 1 when there is a mixed branch.
    Entries are files, extensionless paths, or directories (node_modules and
    hidden folders are skipped).

  ts-analyze inspect <file>
    Plan for one file. Lists its direct imports (resolved through tsconfig
    paths, with their language) and every JavaScript file to migrate before it,
    in order, each with the JavaScript it still imports. Migrating in this
    order never creates a mixed branch. TypeScript imports end the walk: they
    are already migrated. For a TypeScript file, it lists the JavaScript to
    migrate to fix its mixed branch. Never truncated; exits with 0.
    "why" is an alias.

Options:
  --entry <path>        Entry point. May be repeated; positional entries work too.
  -c, --config <file>   tsconfig.json or jsconfig.json. Defaults to the nearest one.
  --tsconfig <file>     Alias for --config.
  --format <format>     human (default) or json. JSON has the same content, untruncated.
  --dry-run             Report mixed branches without failing.
  --report-limit <n>    Items per list in the project report. Defaults to ${DEFAULT_REPORT_LIMIT}.
  --no-report-limit     Show every item in the project report.
  -h, --help            Show this help.

Tags:
  [ready]                     imports no JavaScript, so it can be migrated now
  [cycle: migrate together]   files in an import cycle; migrate them in one go
  [fixes mixed branch]        must be migrated before every mixed branch is fixed
  [this file]                 the file passed to inspect

Examples:
  ts-analyze src
  ts-analyze inspect src/pages/Show.jsx
  ts-analyze inspect --format json src/pages/Show.jsx
  ts-analyze --config tsconfig.app.json --entry src/main.ts --entry src/admin.ts

Exit codes:
  0  no mixed branches (or --dry-run, or inspect)
  1  a TypeScript file imports JavaScript
  2  invalid usage or configuration
`;

export function runCli(argv: readonly string[], environment: CliEnvironment): CliResult {
  try {
    return execute(argv, environment);
  } catch (error) {
    if (error instanceof UsageError) {
      return { exitCode: 2, stdout: "", stderr: `ts-analyze: ${error.message}\n` };
    }
    throw error;
  }
}

function execute(argv: readonly string[], environment: CliEnvironment): CliResult {
  const options = parseOptions(argv);
  if (options.help) {
    return { exitCode: 0, stdout: HELP, stderr: "" };
  }

  const [command, ...rest] = options.positionals;
  if (command === "inspect" || command === "why") {
    const [file] = rest;
    if (file === undefined) {
      throw new UsageError("Provide a file to inspect: ts-analyze inspect <file>");
    }
    const application = createApplication(environment.cwd, options.config);
    const inspection = application.inspect(file);
    const stdout =
      options.format === "json"
        ? renderJsonInspection(inspection, application.root)
        : renderInspection(inspection, { root: application.root, color: environment.color });
    return { exitCode: 0, stdout, stderr: "" };
  }

  const entries = [...options.entries, ...options.positionals];
  if (entries.length === 0) {
    throw new UsageError("Provide at least one entry point. Run ts-analyze --help for usage.");
  }

  const application = createApplication(environment.cwd, options.config);
  const analysis = application.analyze(entries);
  const stdout =
    options.format === "json"
      ? renderJsonReport(analysis, application.root)
      : renderHumanReport(analysis, {
          root: application.root,
          color: environment.color,
          reportLimit: options.reportLimit,
          dryRun: options.dryRun,
        });
  const failed = analysis.mixedBranches.length > 0 && !options.dryRun;
  return { exitCode: failed ? 1 : 0, stdout, stderr: "" };
}

interface CliOptions {
  readonly help: boolean;
  readonly entries: string[];
  readonly positionals: string[];
  readonly config: string | undefined;
  readonly format: "human" | "json";
  readonly dryRun: boolean;
  readonly reportLimit: number | undefined;
}

function parseOptions(argv: readonly string[]): CliOptions {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        entry: { type: "string", multiple: true },
        config: { type: "string", short: "c" },
        tsconfig: { type: "string" },
        format: { type: "string" },
        "dry-run": { type: "boolean" },
        "report-limit": { type: "string" },
        "no-report-limit": { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }

  const { values, positionals } = parsed;
  const format = values.format ?? "human";
  if (format !== "human" && format !== "json") {
    throw new UsageError(`--format must be "human" or "json", got "${format}".`);
  }
  return {
    help: values.help ?? false,
    entries: values.entry ?? [],
    positionals,
    config: values.config ?? values.tsconfig,
    format,
    dryRun: values["dry-run"] ?? false,
    reportLimit: values["no-report-limit"] ? undefined : parseReportLimit(values["report-limit"]),
  };
}

function parseReportLimit(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_REPORT_LIMIT;
  }
  if (!/^\d+$/.test(value)) {
    throw new UsageError(`--report-limit must be a non-negative integer, got "${value}".`);
  }
  return Number(value);
}
