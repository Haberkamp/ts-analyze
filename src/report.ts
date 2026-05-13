import path from "node:path";
import { pathToFileURL } from "node:url";

import type { MigrationPlan } from "./order.js";
import type { DependencyGraph, ManualReviewItem } from "./types.js";

export type ReportLimit = number | false;

export interface ReportInput {
  readonly plan: MigrationPlan;
  readonly graph: DependencyGraph;
  readonly manualReview: ManualReviewItem[];
  readonly basePath: string;
  readonly reportLimit?: ReportLimit;
}

export interface WhyReportInput {
  readonly file: string;
  readonly graph: DependencyGraph;
  readonly basePath: string;
}

const DEFAULT_REPORT_LIMIT = 10;
const ansi = {
  bgYellow: "\u001b[43m",
  blue: "\u001b[34m",
  bold: "\u001b[1m",
  gray: "\u001b[90m",
  reset: "\u001b[0m",
  white: "\u001b[97m",
};
const contentIndent = " ";

export function formatMigrationReport(input: ReportInput): string {
  const lines: string[] = [];
  const reportLimit = input.reportLimit ?? DEFAULT_REPORT_LIMIT;
  pushHeader(lines, "Migration Order:");
  const migrationSteps = input.plan.steps
    .map((step) => {
      const files = step.files.filter((file) => !isTypeScriptFile(file));
      return {
        files,
        isCycle: isCycle(files, input.graph),
      };
    })
    .filter((step) => step.files.length > 0);

  const visibleMigrationSteps = limitReports(migrationSteps, reportLimit);
  const migrationMarkerWidth = markerWidth(visibleMigrationSteps.items.length);
  visibleMigrationSteps.items.forEach((step, index) => {
    const suffix = step.isCycle ? " (cycle group, migrate together)" : "";
    lines.push(
      formatListItem(
        index + 1,
        `${formatFiles(step.files, input.basePath)}${suffix}`,
        migrationMarkerWidth,
      ),
    );
  });
  pushLimitInfo(lines, visibleMigrationSteps, reportLimit);

  if (migrationSteps.length === 0) {
    lines.push(indentContent(formatContent("(no files found)")));
  }

  const cycles = input.plan.cycles
    .map((cycle) => cycle.filter((file) => !isTypeScriptFile(file)))
    .filter((cycle) => isCycle(cycle, input.graph));

  if (cycles.length > 0) {
    pushHeader(lines, "Circular Dependencies:");
    const visibleCycles = limitReports(cycles, reportLimit);
    const cycleMarkerWidth = markerWidth(visibleCycles.items.length);
    visibleCycles.items.forEach((cycle, index) => {
      const [firstFile, ...remainingFiles] = cycle;
      if (!firstFile) {
        return;
      }

      lines.push(
        formatListItem(
          index + 1,
          formatFile(firstFile, input.basePath),
          cycleMarkerWidth,
        ),
      );
      remainingFiles.forEach((file) => {
        lines.push(
          formatNestedListItem(formatFile(file, input.basePath), cycleMarkerWidth),
        );
      });
    });
    pushLimitInfo(lines, visibleCycles, reportLimit);
  }

  const typeScriptFilesWithJsDependencies = findTypeScriptFilesWithJsDependencies(
    input.graph,
  );
  if (typeScriptFilesWithJsDependencies.length > 0) {
    pushWarningHeader(
      lines,
      "TypeScript Files With JavaScript Dependencies:",
    );
    const visibleTypeScriptFilesWithJsDependencies = limitReports(
      typeScriptFilesWithJsDependencies,
      reportLimit,
    );
    const typeScriptWarningMarkerWidth = markerWidth(
      visibleTypeScriptFilesWithJsDependencies.items.length,
    );
    visibleTypeScriptFilesWithJsDependencies.items.forEach((item, index) => {
      lines.push(
        formatListItem(
          index + 1,
          formatFile(item.file, input.basePath),
          typeScriptWarningMarkerWidth,
        ),
      );
    });
    pushLimitInfo(
      lines,
      visibleTypeScriptFilesWithJsDependencies,
      reportLimit,
    );
    lines.push(
      formatInfoBanner(
        "Run `ts-analyze why <file>` to explain why a listed TypeScript file is non-leaf.",
      ),
    );
  }

  if (input.manualReview.length > 0) {
    pushHeader(lines, "Manual Review:");
    const visibleManualReview = limitReports(input.manualReview, reportLimit);
    const manualReviewMarkerWidth = markerWidth(visibleManualReview.items.length);
    visibleManualReview.items.forEach((item, index) => {
      const file = formatFile(item.file, input.basePath);
      lines.push(
        formatListItem(
          index + 1,
          `${file} - ${item.reason}: ${item.detail}`,
          manualReviewMarkerWidth,
        ),
      );
    });
    pushLimitInfo(lines, visibleManualReview, reportLimit);
  }

  pushBlankLineAfterFinalAlert(lines);

  return lines.join("\n");
}

export function formatWhyReport(input: WhyReportInput): string {
  const file = path.normalize(input.file);
  const formattedFile = formatFile(file, input.basePath);

  if (!isTypeScriptFile(file)) {
    return indentContent(`${formattedFile} is not a TypeScript file.`);
  }

  const dependencies = input.graph.get(file);
  if (!dependencies) {
    return indentContent(`No dependency information found for ${formattedFile}.`);
  }

  const jsDependencies = [...dependencies].filter(isJavaScriptFile).sort();
  if (jsDependencies.length === 0) {
    return indentContent(`No JavaScript dependencies found for ${formattedFile}.`);
  }

  const lines: string[] = [];
  pushHeader(lines, `Why ${formattedFile} is listed:`);
  const whyMarkerWidth = markerWidth(jsDependencies.length * 2);
  jsDependencies.forEach((dependency, index) => {
    const formattedDependency = formatFile(dependency, input.basePath);
    lines.push(
      formatListItem(
        index * 2 + 1,
        `${formattedFile} imports ${formattedDependency}`,
        whyMarkerWidth,
      ),
    );
    lines.push(
      formatListItem(
        index * 2 + 2,
        `${formattedDependency} is JavaScript, so ${formattedFile} is not a TypeScript leaf.`,
        whyMarkerWidth,
      ),
    );
  });

  return lines.join("\n");
}

function pushHeader(lines: string[], title: string): void {
  if (lines.length > 0) {
    lines.push("", "");
  } else {
    lines.push("");
  }

  lines.push(indentContent(`${ansi.bold}${title}${ansi.reset}`), "");
}

function pushWarningHeader(lines: string[], title: string): void {
  if (lines.length > 0) {
    lines.push("", "");
  }

  const heading = `  [Warning]: ${title}  `;
  const padding = " ".repeat(heading.length);
  lines.push(
    indentContent(`${ansi.bgYellow}${padding}${ansi.reset}`),
    indentContent(`${ansi.bgYellow}${ansi.blue}${ansi.bold}${heading}${ansi.reset}`),
    indentContent(`${ansi.bgYellow}${padding}${ansi.reset}`),
    "",
  );
}

function formatListItem(index: number, content: string, width: number): string {
  const marker = `${index.toString().padStart(width, " ")}.`;

  return indentContent(
    `${ansi.gray}${marker}${ansi.reset} ${formatContent(content)}`,
  );
}

function formatNestedListItem(content: string, parentWidth: number): string {
  const indent = " ".repeat(parentWidth + 2);

  return indentContent(
    `${ansi.gray}${indent}-${ansi.reset} ${formatContent(content)}`,
  );
}

function formatContent(content: string): string {
  return `${ansi.white}${content}${ansi.reset}`;
}

function formatInfoBanner(message: string): string {
  const label = `${ansi.bold}[Info]:${ansi.reset}`;

  return [
    `${ansi.gray}${ansi.reset}`,
    indentContent(`${ansi.gray}  ${label}${ansi.gray} ${message}  ${ansi.reset}`),
  ].join("\n");
}

function indentContent(content: string): string {
  return `${contentIndent}${content}`;
}

function pushBlankLineAfterFinalAlert(lines: string[]): void {
  const lastLine = lines.at(-1);
  if (lastLine?.includes(`${ansi.bold}[Info]:`) ?? false) {
    lines.push("");
  }
}

function markerWidth(itemCount: number): number {
  return Math.max(1, itemCount.toString().length);
}

function formatFiles(files: string[], basePath: string): string {
  return files.map((file) => formatFile(file, basePath)).join(", ");
}

function formatFile(file: string, basePath: string): string {
  return hyperlink(relativePath(file, basePath), fileUrl(file, basePath));
}

function hyperlink(text: string, url: string): string {
  return `\u001b]8;;${url}\u0007${text}\u001b]8;;\u0007`;
}

function fileUrl(file: string, basePath: string): string {
  const absoluteFile = path.isAbsolute(file) ? file : path.resolve(basePath, file);

  return pathToFileURL(absoluteFile).href;
}

function limitReports<T>(
  reports: T[],
  reportLimit: ReportLimit,
): { items: T[]; total: number } {
  if (reportLimit === false || reports.length <= reportLimit) {
    return { items: reports, total: reports.length };
  }

  return { items: reports.slice(0, reportLimit), total: reports.length };
}

function pushLimitInfo<T>(
  lines: string[],
  result: { items: T[]; total: number },
  reportLimit: ReportLimit,
): void {
  if (reportLimit === false || result.total <= reportLimit) {
    return;
  }

  lines.push(
    formatInfoBanner(
      `Showing ${reportLimit} of ${result.total} reports. Configure with \`--report-limit <number>\` or disable with \`--no-report-limit\`.`,
    ),
  );
}

function relativePath(file: string, basePath: string): string {
  return path.relative(basePath, file) || path.basename(file);
}

function findTypeScriptFilesWithJsDependencies(
  graph: DependencyGraph,
): Array<{ file: string; dependencies: string[] }> {
  const items: Array<{ file: string; dependencies: string[] }> = [];

  for (const [file, dependencies] of graph) {
    if (!isTypeScriptFile(file)) {
      continue;
    }

    const jsDependencies = [...dependencies].filter(isJavaScriptFile).sort();
    if (jsDependencies.length > 0) {
      items.push({ file, dependencies: jsDependencies });
    }
  }

  return items.sort((left, right) => left.file.localeCompare(right.file));
}

function isCycle(files: string[], graph: DependencyGraph): boolean {
  return (
    files.length > 1 ||
    files.some((file) => graph.get(file)?.has(file) ?? false)
  );
}

function isTypeScriptFile(file: string): boolean {
  return [".ts", ".tsx"].includes(path.extname(file)) && !file.endsWith(".d.ts");
}

function isJavaScriptFile(file: string): boolean {
  return [".js", ".jsx", ".mjs", ".cjs"].includes(path.extname(file));
}
