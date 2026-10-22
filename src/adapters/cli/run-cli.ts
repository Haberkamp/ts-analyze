import { parseArgs } from "node:util";

import { UsageError } from "../../application/ports.js";
import { createApplication } from "../../composition-root.js";
import { renderExplanation, renderHumanReport } from "./human-report.js";
import { renderJsonExplanation, renderJsonReport } from "./json-report.js";

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
  ts-analyze [options] why <file.ts>

Lists the JavaScript files of a project in the order to migrate them to TypeScript,
shows circular dependencies, and fails when a TypeScript file imports JavaScript
(a mixed branch).

Entries are files, extensionless paths, or directories (node_modules and hidden
folders are skipped).

Options:
  --entry <path>        Entry point. May be repeated; positional entries work too.
  -c, --config <file>   tsconfig.json or jsconfig.json. Defaults to the nearest one.
  --tsconfig <file>     Alias for --config.
  --format <format>     human (default) or json.
  --dry-run             Report mixed branches without failing.
  --report-limit <n>    Items shown per list in the human report. Defaults to ${DEFAULT_REPORT_LIMIT}.
  --no-report-limit     Show every item.
  -h, --help            Show this help.

Exit codes:
  0  no mixed branches (or --dry-run)
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
  if (command === "why") {
    const [file] = rest;
    if (file === undefined) {
      throw new UsageError("Provide a TypeScript file to explain: ts-analyze why <file.ts>");
    }
    const application = createApplication(environment.cwd, options.config);
    const explanation = application.explain(file);
    const stdout =
      options.format === "json"
        ? renderJsonExplanation(explanation, application.root)
        : renderExplanation(explanation, { root: application.root, color: environment.color });
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
