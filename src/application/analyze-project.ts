import { analyzeGraph } from "../domain/analysis.js";
import type { Analysis, Dependency, ManualReviewItem } from "../domain/model.js";
import { languageOf } from "../domain/source-file.js";
import type { AnalysisPorts } from "./ports.js";

export function analyzeProject(entries: readonly string[], ports: AnalysisPorts): Analysis {
  const graph = new Map<string, Dependency[]>();
  const manualReview: ManualReviewItem[] = [];
  const pending = ports.entryPoints.find(entries);
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

  return analyzeGraph(graph, manualReview);
}

export type Explanation =
  | { readonly file: string; readonly typescript: false }
  | { readonly file: string; readonly typescript: true; readonly javascriptImports: Dependency[] };

/** Explains why a TypeScript file is on a mixed branch: the JavaScript files it imports. */
export function explainFile(entry: string, ports: AnalysisPorts): Explanation {
  const [file = entry] = ports.entryPoints.find([entry]);
  if (languageOf(file) !== "typescript") {
    return { file, typescript: false };
  }
  const branch = analyzeProject([file], ports).mixedBranches.find((candidate) => candidate.file === file);
  return { file, typescript: true, javascriptImports: branch?.imports ?? [] };
}
