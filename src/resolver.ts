import path from "node:path";
import ts from "typescript";

import type { TsProjectConfig } from "./types.js";

export function resolveImport(
  containingFile: string,
  specifier: string,
  projectConfig: TsProjectConfig,
): string | undefined {
  const resolved = ts.resolveModuleName(
    specifier,
    containingFile,
    projectConfig.compilerOptions,
    ts.sys,
  ).resolvedModule;

  if (!resolved) {
    return undefined;
  }

  const resolvedFileName = path.normalize(resolved.resolvedFileName);

  if (
    resolved.isExternalLibraryImport ||
    resolvedFileName.includes(`${path.sep}node_modules${path.sep}`) ||
    resolvedFileName.endsWith(".d.ts")
  ) {
    return undefined;
  }

  return resolvedFileName;
}
