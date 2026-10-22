import path from "node:path";
import { pathToFileURL } from "node:url";

import type { Inspection } from "../../application/analyze-project.js";
import type { Analysis, Cycle, ManualReviewItem, PriorityStep } from "../../domain/model.js";
import { languageOf } from "../../domain/source-file.js";

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

  const moreHint = (hidden: number, indent: string): string =>
    style.dim(`${indent}… ${hidden} more (use --report-limit <n> or --no-report-limit to show more)`);
  const limit = <T>(items: readonly T[]): readonly T[] =>
    options.reportLimit === undefined ? items : items.slice(0, options.reportLimit);

  const section = <T>(
    title: string,
    items: readonly T[],
    render: (item: T, marker: string, index: number) => string[],
  ): void => {
    lines.push(style.bold(`${title} (${items.length})`), "");
    const visible = limit(items);
    visible.forEach((item, index) => lines.push(...render(item, `${index + 1}. `, index)));
    if (visible.length < items.length) {
      lines.push(moreHint(items.length - visible.length, "  "));
    }
  };

  /** Files of a cycle group that are not on the drawn loop, limited like every other list. */
  const renderCycleGroupRest = (cycle: Cycle, marker: string): string[] => {
    const rest = cycle.files.filter((file) => !cycle.path.includes(file));
    if (rest.length === 0) {
      return [];
    }
    const indent = " ".repeat(6 + marker.length);
    const visible = limit(rest);
    return [
      `${indent}${style.dim(`also in this cycle group (${rest.length}):`)}`,
      ...visible.map((file) => `${indent}${style.file(file)}`),
      ...(visible.length < rest.length ? [moreHint(rest.length - visible.length, indent)] : []),
    ];
  };

  section("Migration priority", analysis.priority, (step, marker) => [
    `  ${marker}${step.files.map(style.file).join(", ")}${formatTags(step, style)}`,
  ]);
  if (analysis.priority.length === 0) {
    lines.push("  Nothing to migrate: every reachable file is TypeScript.");
  }
  lines.push("");

  if (analysis.cycles.length > 0) {
    section("Circular dependencies", analysis.cycles, (cycle, marker, index) => [
      ...(index > 0 ? [""] : []),
      ...renderCycle(cycle, marker, style),
      ...renderCycleGroupRest(cycle, marker),
    ]);
    lines.push("");
  }

  if (analysis.mixedBranches.length > 0) {
    section("Mixed branches: TypeScript importing JavaScript", analysis.mixedBranches, (branch, marker) => [
      `  ${marker}${style.file(branch.file)}`,
      ...branch.imports.map(
        (dependency) =>
          `${" ".repeat(4 + marker.length)}${style.dim("imports")} ${style.yellow(style.file(dependency.file))}  ${style.dim(`[line ${dependency.line}]`)}`,
      ),
    ]);
    lines.push("");
  }

  if (analysis.manualReview.length > 0) {
    section("Manual review", analysis.manualReview, (item, marker) => [formatManualReview(item, marker, style)]);
    lines.push("");
  }

  const { files, typescript } = analysis.summary;
  // Floor so 100% only appears once every file is migrated.
  const progress = files === 0 ? 100 : Math.floor((typescript / files) * 100);
  lines.push(
    style.bold("Summary"),
    "",
    `  ${style.dim("Progress")}  ${progress}%`,
    `  ${style.dim("Migrated")}  ${typescript} ${typescript === 1 ? "file" : "files"}`,
    `  ${style.dim("Total   ")}  ${files} ${files === 1 ? "file" : "files"}`,
    "",
  );

  lines.push(verdict(analysis.mixedBranches.length, options.dryRun, style), "");
  if (analysis.priority.length > 0) {
    lines.push(
      style.dim("Tip: run `ts-analyze inspect <file>` to see what to migrate before a specific file, in order."),
      "",
    );
  }
  return lines.join("\n");
}

export function renderInspection(
  inspection: Inspection,
  options: { readonly root: string; readonly color: boolean },
): string {
  const style = createStyle(options);
  const { file, imports, plan } = inspection;
  const lines = [`${style.bold(style.file(file))}${tagList([languageName(file)], style)}`, ""];

  lines.push(style.bold(`Direct imports (${imports.length})`), "");
  imports.forEach((dependency, index) => {
    const name =
      languageOf(dependency.file) === "javascript"
        ? style.yellow(style.file(dependency.file))
        : style.file(dependency.file);
    lines.push(
      `  ${index + 1}. ${name}${tagList([`${languageName(dependency.file)}, line ${dependency.line}`], style)}`,
    );
  });
  if (imports.length === 0) {
    lines.push("  None.");
  }
  lines.push("");

  if (plan.length > 0) {
    lines.push(style.bold(`Migration order (${plan.length})`), "");
    plan.forEach((step, index) => {
      const marker = `${index + 1}. `;
      const tags = [
        ...(step.cycle ? ["cycle: migrate together"] : []),
        ...(step.imports.length === 0 ? ["ready"] : []),
        ...(step.files.includes(file) ? ["this file"] : []),
      ];
      lines.push(
        `  ${marker}${step.files.map(style.file).join(", ")}${tagList(tags, style)}`,
        ...step.imports.map(
          (dependency) => `${" ".repeat(4 + marker.length)}${style.dim("imports")} ${style.file(dependency.file)}`,
        ),
      );
    });
    lines.push("");
  }

  if (inspection.manualReview.length > 0) {
    lines.push(style.bold(`Manual review (${inspection.manualReview.length})`), "");
    inspection.manualReview.forEach((item, index) => lines.push(formatManualReview(item, `${index + 1}. `, style)));
    lines.push("");
  }

  lines.push(inspectionVerdict(inspection, style), "");
  return lines.join("\n");
}

function inspectionVerdict({ file, plan }: Inspection, style: Style): string {
  const name = style.file(file);
  const count = (value: number): string => `${value} ${value === 1 ? "file" : "files"}`;
  const first = style.file(plan[0]?.files[0] ?? "");
  if (languageOf(file) === "typescript") {
    if (plan.length === 0) {
      return style.green(`✔ ${name} imports no JavaScript.`);
    }
    const total = plan.reduce((sum, step) => sum + step.files.length, 0);
    return `${style.red(`✖ ${name} imports JavaScript.`)} Migrate the ${count(total)} above in order, starting with ${first}.`;
  }
  const before = plan.slice(0, -1).reduce((sum, step) => sum + step.files.length, 0);
  const together = (plan.at(-1)?.files.length ?? 1) - 1;
  const cycle =
    together > 0 ? ` together with ${together} other ${together === 1 ? "file" : "files"} in its import cycle` : "";
  if (before === 0) {
    return together === 0
      ? style.green(`✔ ${name} can be migrated now: it imports no JavaScript.`)
      : `${style.bold("→")} Migrate ${name}${cycle}.`;
  }
  return `${style.bold("→")} Migrate ${count(before)} first, starting with ${first}, then ${name}${cycle}.`;
}

function languageName(file: string): string {
  return languageOf(file) === "typescript" ? "TypeScript" : "JavaScript";
}

function tagList(tags: readonly string[], style: Style): string {
  return tags.length === 0 ? "" : `  ${style.dim(`[${tags.join(", ")}]`)}`;
}

function formatManualReview(item: ManualReviewItem, marker: string, style: Style): string {
  return `  ${marker}${style.file(item.file)}:${item.line}  ${item.detail.replace(/\s+/g, " ")}  ${style.dim(`[${item.reason}]`)}`;
}

function formatTags(step: PriorityStep, style: Style): string {
  const tags = [
    ...(step.cycle ? ["cycle: migrate together"] : []),
    ...(step.ready ? ["ready"] : []),
    ...(step.fixesMixedBranch ? ["fixes mixed branch"] : []),
  ];
  return tagList(tags, style);
}

/**
 * One file per line with an arrow to the file it imports; the bracket on the left
 * leads from the last file back up to the first:
 *
 *   1. ┌─▶ src/a.js
 *      │   ↓
 *      └── src/b.js
 */
function renderCycle(cycle: Cycle, marker: string, style: Style): string[] {
  const indent = " ".repeat(2 + marker.length);
  const files = cycle.path.slice(0, -1);
  const [first = ""] = files;
  if (files.length === 1) {
    return [`  ${marker}${style.file(first)}  ${style.dim("[imports itself]")}`];
  }
  const lines = files.flatMap((file, position) => {
    const isLast = position === files.length - 1;
    const prefix = position === 0 ? `  ${marker}${style.dim("┌─▶")}` : `${indent}${style.dim(isLast ? "└──" : "│  ")}`;
    return [`${prefix} ${style.file(file)}`, ...(isLast ? [] : [`${indent}${style.dim("│   ↓")}`])];
  });
  return lines;
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
  readonly bold: (text: string) => string;
  readonly dim: (text: string) => string;
  readonly red: (text: string) => string;
  readonly green: (text: string) => string;
  readonly yellow: (text: string) => string;
  /** Path relative to the root, hyperlinked to the file when color is enabled. */
  readonly file: (file: string) => string;
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
