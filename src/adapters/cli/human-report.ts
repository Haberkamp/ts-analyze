import path from "node:path";
import { pathToFileURL } from "node:url";

import type { Explanation } from "../../application/analyze-project.js";
import type { Analysis, PriorityStep } from "../../domain/model.js";

export interface HumanReportOptions {
  readonly root: string;
  readonly color: boolean;
  /** Items per list; undefined shows everything. */
  readonly reportLimit: number | undefined;
  readonly dryRun: boolean;
}

export function renderHumanReport(analysis: Analysis, options: HumanReportOptions): string {
  const style = createStyle(options);
  const lines: string[] = [];

  const section = <T>(title: string, items: readonly T[], render: (item: T, marker: string) => string[]): void => {
    lines.push(style.bold(`${title} (${items.length})`), "");
    const visible = options.reportLimit === undefined ? items : items.slice(0, options.reportLimit);
    visible.forEach((item, index) => lines.push(...render(item, `${index + 1}. `)));
    if (visible.length < items.length) {
      lines.push(
        style.dim(`  … ${items.length - visible.length} more (use --report-limit <n> or --no-report-limit to show more)`),
      );
    }
  };

  section("Migration priority", analysis.priority, (step, marker) => [
    `  ${marker}${step.files.map(style.file).join(", ")}${formatTags(step, style)}`,
  ]);
  if (analysis.priority.length === 0) {
    lines.push("  Nothing to migrate: every reachable file is TypeScript.");
  }
  lines.push("");

  if (analysis.cycles.length > 0) {
    section("Circular dependencies", analysis.cycles, (cycle, marker) => {
      const others = cycle.files.filter((file) => !cycle.path.includes(file));
      const suffix = others.length > 0 ? style.dim(` (group also includes ${others.map(style.file).join(", ")})`) : "";
      return [`  ${marker}${cycle.path.map(style.file).join(" → ")}${suffix}`];
    });
    lines.push("");
  }

  if (analysis.mixedBranches.length > 0) {
    section("Mixed branches: TypeScript importing JavaScript", analysis.mixedBranches, (branch, marker) => [
      `  ${marker}${style.file(branch.file)}`,
      ...branch.imports.map(
        (dependency) =>
          `${" ".repeat(2 + marker.length)}imports ${style.file(dependency.file)} ${style.dim(`(line ${dependency.line})`)}`,
      ),
    ]);
    lines.push("");
  }

  if (analysis.manualReview.length > 0) {
    section("Manual review", analysis.manualReview, (item, marker) => [
      `  ${marker}${style.file(item.file)}:${item.line}  ${item.reason}: ${item.detail}`,
    ]);
    lines.push("");
  }

  lines.push(verdict(analysis.mixedBranches.length, options.dryRun, style), "");
  return lines.join("\n");
}

export function renderExplanation(
  explanation: Explanation,
  options: { readonly root: string; readonly color: boolean },
): string {
  const style = createStyle(options);
  const file = style.file(explanation.file);
  if (!explanation.typescript) {
    return `${file} is not a TypeScript file.\n`;
  }
  if (explanation.javascriptImports.length === 0) {
    return `${file} imports no JavaScript.\n`;
  }
  return [
    `${file} imports JavaScript:`,
    "",
    ...explanation.javascriptImports.map(
      (dependency, index) => `  ${index + 1}. ${style.file(dependency.file)} ${style.dim(`(line ${dependency.line})`)}`,
    ),
    "",
    "Migrate these files to TypeScript to fix this mixed branch.",
    "",
  ].join("\n");
}

function formatTags(step: PriorityStep, style: Style): string {
  const tags = [
    ...(step.cycle ? ["cycle: migrate together"] : []),
    ...(step.ready ? ["ready"] : []),
    ...(step.fixesMixedBranch ? ["fixes mixed branch"] : []),
  ];
  return tags.length === 0 ? "" : `  ${(step.fixesMixedBranch ? style.yellow : style.dim)(`[${tags.join(", ")}]`)}`;
}

function verdict(count: number, dryRun: boolean, style: Style): string {
  if (count === 0) {
    return style.green("✔ No mixed branches: no TypeScript file imports JavaScript.");
  }
  const subject = count === 1 ? "1 TypeScript file imports" : `${count} TypeScript files import`;
  return [
    style.red(`✖ ${subject} JavaScript.`),
    'Migrate the files marked "fixes mixed branch" first.',
    ...(dryRun ? ["(dry run: not failing)"] : []),
  ].join(" ");
}

interface Style {
  bold(text: string): string;
  dim(text: string): string;
  red(text: string): string;
  green(text: string): string;
  yellow(text: string): string;
  /** Path relative to the root, hyperlinked to the file when color is enabled. */
  file(file: string): string;
}

function createStyle(options: { readonly root: string; readonly color: boolean }): Style {
  const relative = (file: string): string => path.relative(options.root, file).split(path.sep).join("/");
  if (!options.color) {
    const plain = (text: string): string => text;
    return { bold: plain, dim: plain, red: plain, green: plain, yellow: plain, file: relative };
  }
  const sgr = (code: string) => (text: string) => `\u001b[${code}m${text}\u001b[0m`;
  return {
    bold: sgr("1"),
    dim: sgr("2"),
    red: sgr("1;31"),
    green: sgr("1;32"),
    yellow: sgr("33"),
    file: (file) => `\u001b]8;;${pathToFileURL(file).href}\u0007${relative(file)}\u001b]8;;\u0007`,
  };
}
