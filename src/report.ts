import path from "node:path";

import type { MigrationPlan } from "./order.js";
import type { ManualReviewItem } from "./types.js";

export interface ReportInput {
  readonly plan: MigrationPlan;
  readonly manualReview: ManualReviewItem[];
  readonly basePath: string;
}

export function formatMigrationReport(input: ReportInput): string {
  const lines: string[] = ["Migration Order:"];

  input.plan.steps.forEach((step, index) => {
    lines.push(
      `${index + 1}. ${formatFiles(step.files, input.basePath)}${
        step.isCycle ? " (cycle group, migrate together)" : ""
      }`,
    );
  });

  if (input.plan.steps.length === 0) {
    lines.push("(no files found)");
  }

  if (input.plan.cycles.length > 0) {
    lines.push("", "Circular Dependencies:");
    input.plan.cycles.forEach((cycle, index) => {
      lines.push(`${index + 1}. ${formatFiles(cycle, input.basePath)}`);
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
