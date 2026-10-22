import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach } from "vitest";

import { runCli } from "../src/adapters/cli/run-cli.js";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesRoot = path.join(repoRoot, "fixtures");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

export interface JsonReport {
  readonly ok: boolean;
  readonly summary: {
    readonly files: number;
    readonly javascript: number;
    readonly typescript: number;
  };
  readonly priority: ReadonlyArray<{
    readonly files: string[];
    readonly cycle: boolean;
    readonly ready: boolean;
    readonly fixesMixedBranch: boolean;
    readonly importedBy: number;
  }>;
  readonly mixedBranches: ReadonlyArray<{
    readonly file: string;
    readonly imports: ReadonlyArray<{
      readonly file: string;
      readonly specifier: string;
      readonly line: number;
    }>;
  }>;
  readonly cycles: ReadonlyArray<{
    readonly files: string[];
    readonly path: string[];
  }>;
  readonly manualReview: ReadonlyArray<{
    readonly file: string;
    readonly line: number;
    readonly reason: string;
    readonly detail: string;
  }>;
}

export function temporaryDirectory(): string {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyze-")));
  temporaryDirectories.push(directory);
  return directory;
}

/** Copies a fixture outside the repository so no parent tsconfig.json leaks in. */
export function copyFixture(name: string): string {
  const destination = path.join(temporaryDirectory(), name);
  fs.cpSync(path.join(fixturesRoot, name), destination, {
    recursive: true,
    verbatimSymlinks: true,
  });
  return destination;
}

export function run(
  cwd: string,
  args: string[],
  options: { readonly color?: boolean } = {},
): { exitCode: number; stdout: string; stderr: string } {
  return runCli(args, { cwd, color: options.color ?? false });
}

export function analyzeFixture(
  name: string,
  entries: string[] = ["src"],
): { exitCode: number; report: JsonReport } {
  const result = run(copyFixture(name), ["--format", "json", ...entries]);
  if (result.stderr !== "") {
    throw new Error(`Unexpected stderr: ${result.stderr}`);
  }
  return { exitCode: result.exitCode, report: JSON.parse(result.stdout) as JsonReport };
}

export function priorityFiles(report: JsonReport): string[][] {
  return report.priority.map((step) => step.files);
}
