import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

import { extractImportSpecifiers } from "./imports.js";
import { resolveImport } from "./resolver.js";
import type { DependencyGraph, ManualReviewItem, TsProjectConfig } from "./types.js";

interface BuildGraphResult {
  readonly graph: DependencyGraph;
  readonly manualReview: ManualReviewItem[];
}

const ENTRY_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"];

export function buildDependencyGraph(
  entryPoints: string[],
  projectConfig: TsProjectConfig,
  cwd = process.cwd(),
): BuildGraphResult {
  const graph: DependencyGraph = new Map();
  const manualReview: ManualReviewItem[] = [];
  const visited = new Set<string>();

  for (const entryPoint of entryPoints) {
    visitFile(resolveEntryPoint(entryPoint, cwd, projectConfig.basePath));
  }

  return { graph, manualReview };

  function visitFile(filePath: string): void {
    const normalizedFilePath = path.normalize(filePath);

    if (visited.has(normalizedFilePath)) {
      return;
    }

    visited.add(normalizedFilePath);
    graph.set(normalizedFilePath, new Set());

    const sourceText = fs.readFileSync(normalizedFilePath, "utf8");
    const sourceFile = ts.createSourceFile(
      normalizedFilePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
    );

    const extraction = extractImportSpecifiers(sourceFile);
    manualReview.push(...extraction.manualReview);

    for (const imported of extraction.imports) {
      const resolved = resolveImport(
        normalizedFilePath,
        imported.specifier,
        projectConfig,
      );

      if (!resolved) {
        continue;
      }

      graph.get(normalizedFilePath)?.add(resolved);
      visitFile(resolved);
    }
  }
}

function resolveEntryPoint(
  entryPoint: string,
  cwd: string,
  basePath: string,
): string {
  const cwdPath = path.resolve(cwd, entryPoint);
  const cwdMatch = resolveFileLikePath(cwdPath);
  if (cwdMatch) {
    return cwdMatch;
  }

  const absolutePath = path.resolve(basePath, entryPoint);
  const basePathMatch = resolveFileLikePath(absolutePath);
  if (basePathMatch) {
    return basePathMatch;
  }

  throw new Error(`Entry point not found: ${entryPoint}`);
}

function resolveFileLikePath(absolutePath: string): string | undefined {
  if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
    return path.normalize(absolutePath);
  }

  for (const extension of ENTRY_EXTENSIONS) {
    const candidate = `${absolutePath}${extension}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return path.normalize(candidate);
    }
  }

  if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory()) {
    for (const extension of ENTRY_EXTENSIONS) {
      const candidate = path.join(absolutePath, `index${extension}`);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return path.normalize(candidate);
      }
    }
  }
}
