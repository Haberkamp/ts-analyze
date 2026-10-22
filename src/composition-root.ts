import { FileSystemEntryPointFinder } from "./adapters/filesystem/entry-point-finder.js";
import { TypeScriptImportScanner } from "./adapters/typescript/import-scanner.js";
import { TypeScriptModuleResolver } from "./adapters/typescript/module-resolver.js";
import { loadTypeScriptProject } from "./adapters/typescript/project-config.js";
import { analyzeProject, explainFile } from "./application/analyze-project.js";
import type { Explanation } from "./application/analyze-project.js";
import type { AnalysisPorts } from "./application/ports.js";
import type { Analysis } from "./domain/model.js";

export interface Application {
  /** Directory that reported paths are relative to. */
  readonly root: string;
  analyze(entries: readonly string[]): Analysis;
  explain(file: string): Explanation;
}

/** Wires the use cases to the file system and TypeScript adapters. */
export function createApplication(cwd: string, configPath?: string): Application {
  const project = loadTypeScriptProject(cwd, configPath);
  const ports: AnalysisPorts = {
    entryPoints: new FileSystemEntryPointFinder(cwd),
    scanner: new TypeScriptImportScanner(),
    resolver: new TypeScriptModuleResolver(project),
  };
  return {
    root: project.root,
    analyze: (entries) => analyzeProject(entries, ports),
    explain: (file) => explainFile(file, ports),
  };
}
