import { analyzeGraph } from "../domain/analysis.js";
import type { Analysis, Dependency, FilePlan, ManualReviewItem } from "../domain/model.js";
import { planFile } from "../domain/plan.js";
import { languageOf } from "../domain/source-file.js";
import { UsageError } from "./ports.js";
import type { AnalysisPorts } from "./ports.js";

export function analyzeProject(entries: readonly string[], ports: AnalysisPorts): Analysis {
  const { graph, manualReview } = buildGraph(ports.entryPoints.find(entries), ports);
  return analyzeGraph(graph, manualReview);
}

export interface Inspection extends FilePlan {
  /** Manual review items of the file and of the files in its plan. */
  readonly manualReview: ManualReviewItem[];
}

/** Plans the migration of one file: what to migrate before it, in order. */
export function inspectFile(entry: string, ports: AnalysisPorts): Inspection {
  const files = ports.entryPoints.find([entry]);
  const [file] = files;
  if (file === undefined || files.length !== 1) {
    throw new UsageError(`inspect expects a single source file, got: ${entry}`);
  }
  const { graph, manualReview } = buildGraph([file], ports);
  const plan = planFile(graph, file);
  const involved = new Set([file, ...plan.plan.flatMap((step) => step.files)]);
  return {
    ...plan,
    manualReview: manualReview
      .filter((item) => involved.has(item.file))
      .sort((left, right) => (left.file < right.file ? -1 : left.file > right.file ? 1 : left.line - right.line)),
  };
}

/** Every source file reachable from the entry files, with the source files each one imports. */
function buildGraph(
  entryFiles: string[],
  ports: AnalysisPorts,
): { graph: Map<string, Dependency[]>; manualReview: ManualReviewItem[] } {
  const graph = new Map<string, Dependency[]>();
  const manualReview: ManualReviewItem[] = [];
  const pending = [...entryFiles];
  const discovered = new Set(pending);

  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    const dependencies: Dependency[] = [];
    graph.set(file, dependencies);

    const scanned = ports.scanner.scan(file);
    manualReview.push(...scanned.manualReview);

    for (const reference of scanned.imports) {
      const resolution = ports.resolver.resolve(file, reference);
      if (resolution.kind === "missing") {
        manualReview.push({ file, line: reference.line, reason: "unresolved import", detail: reference.specifier });
      }
      if (resolution.kind !== "source" || languageOf(resolution.file) === undefined) {
        continue;
      }
      dependencies.push({ file: resolution.file, specifier: reference.specifier, line: reference.line });
      if (!discovered.has(resolution.file)) {
        discovered.add(resolution.file);
        pending.push(resolution.file);
      }
    }
  }

  return { graph, manualReview };
}
