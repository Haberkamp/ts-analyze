import { analyzeGraph, firstImportPerFile } from "./analysis.js";
import type { Dependency, FilePlan, ModuleGraph } from "./model.js";
import { languageOf } from "./source-file.js";

const isJavaScript = (file: string): boolean => languageOf(file) === "javascript";

/**
 * Only JavaScript blocks a migration: a file can become TypeScript once everything it imports
 * is TypeScript. So the plan follows imports of JavaScript files and stops at TypeScript files,
 * whose own JavaScript imports are a separate mixed branch, not a prerequisite.
 */
export function planFile(graph: ModuleGraph, file: string): FilePlan {
  const imports = firstImportPerFile((graph.get(file) ?? []).filter((dependency) => dependency.file !== file));
  const roots = isJavaScript(file)
    ? [file]
    : imports.filter((dependency) => isJavaScript(dependency.file)).map((dependency) => dependency.file);

  const required = new Set(roots);
  const pending = [...roots];
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    for (const dependency of graph.get(current) ?? []) {
      if (isJavaScript(dependency.file) && !required.has(dependency.file)) {
        required.add(dependency.file);
        pending.push(dependency.file);
      }
    }
  }

  const subgraph = new Map<string, Dependency[]>(
    Array.from(required, (member) => [
      member,
      (graph.get(member) ?? []).filter((dependency) => required.has(dependency.file)),
    ]),
  );
  // The project priority order restricted to these files: dependencies first, cycles grouped.
  const plan = analyzeGraph(subgraph, []).priority.map((step) => ({
    files: step.files,
    cycle: step.cycle,
    imports: firstImportPerFile(
      step.files
        .flatMap((member) => subgraph.get(member) ?? [])
        .filter((dependency) => !step.files.includes(dependency.file)),
    ),
  }));

  return { file, ready: !imports.some((dependency) => isJavaScript(dependency.file)), imports, plan };
}
