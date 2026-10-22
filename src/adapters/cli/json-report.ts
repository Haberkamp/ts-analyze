import path from "node:path";

import type { Explanation } from "../../application/analyze-project.js";
import type { Analysis, Dependency } from "../../domain/model.js";

/** Machine-readable report: same content as the human report, unlimited, with root-relative paths. */
export function renderJsonReport(analysis: Analysis, root: string): string {
  const relative = relativeTo(root);
  const dependency = (item: Dependency) => ({ ...item, file: relative(item.file) });
  return stringify({
    ok: analysis.mixedBranches.length === 0,
    summary: analysis.summary,
    priority: analysis.priority.map((step) => ({ ...step, files: step.files.map(relative) })),
    mixedBranches: analysis.mixedBranches.map((branch) => ({
      file: relative(branch.file),
      imports: branch.imports.map(dependency),
    })),
    cycles: analysis.cycles.map((cycle) => ({ files: cycle.files.map(relative), path: cycle.path.map(relative) })),
    manualReview: analysis.manualReview.map((item) => ({ ...item, file: relative(item.file) })),
  });
}

export function renderJsonExplanation(explanation: Explanation, root: string): string {
  const relative = relativeTo(root);
  return stringify({
    file: relative(explanation.file),
    typescript: explanation.typescript,
    javascriptImports: explanation.typescript
      ? explanation.javascriptImports.map((item) => ({ ...item, file: relative(item.file) }))
      : [],
  });
}

function relativeTo(root: string): (file: string) => string {
  return (file) => path.relative(root, file).split(path.sep).join("/");
}

function stringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
