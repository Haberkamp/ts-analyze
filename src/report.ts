import path from "node:path";

import type { MigrationPlan } from "./order.js";
import type { DependencyGraph, ManualReviewItem } from "./types.js";

export interface ReportInput {
  readonly plan: MigrationPlan;
  readonly graph: DependencyGraph;
  readonly manualReview: ManualReviewItem[];
  readonly basePath: string;
}

export function formatMigrationReport(input: ReportInput): string {
  const lines: string[] = ["Migration Order:"];
  const migrationSteps = input.plan.steps
    .map((step) => {
      const files = step.files.filter((file) => !isTypeScriptFile(file));
      return {
        files,
        isCycle: isCycle(files, input.graph),
      };
    })
    .filter((step) => step.files.length > 0);

  migrationSteps.forEach((step, index) => {
    lines.push(
      `${index + 1}. ${formatFiles(step.files, input.basePath)}${
        step.isCycle ? " (cycle group, migrate together)" : ""
      }`,
    );
  });

  if (migrationSteps.length === 0) {
    lines.push("(no files found)");
  }

  const cycles = input.plan.cycles
    .map((cycle) => cycle.filter((file) => !isTypeScriptFile(file)))
    .filter((cycle) => isCycle(cycle, input.graph));

  if (cycles.length > 0) {
    lines.push("", "Circular Dependencies:");
    cycles.forEach((cycle, index) => {
      lines.push(`${index + 1}. ${formatFiles(cycle, input.basePath)}`);
    });
  }

  const typeScriptFilesWithJsDependencies = findTypeScriptFilesWithJsDependencies(
    input.graph,
  );
  if (typeScriptFilesWithJsDependencies.length > 0) {
    lines.push("", "Warning: TypeScript Files With JavaScript Dependencies:");
    typeScriptFilesWithJsDependencies.forEach((item, index) => {
      lines.push(
        `${index + 1}. ${relativePath(item.file, input.basePath)} -> ${formatFiles(
          item.dependencies,
          input.basePath,
        )}`,
      );
    });
  }

  if (input.manualReview.length > 0) {
    lines.push("", "Manual Review:");
    input.manualReview.forEach((item, index) => {
      lines.push(
        `${index + 1}. ${relativePath(item.file, input.basePath)} - ${
          item.reason
        }: ${item.detail}`,
      );
    });
  }

  return lines.join("\n");
}

function formatFiles(files: string[], basePath: string): string {
  return files.map((file) => relativePath(file, basePath)).join(", ");
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
