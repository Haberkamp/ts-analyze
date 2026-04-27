import path from "node:path";
import ts from "typescript";

import type { TsProjectConfig } from "./types.js";

export function loadTsConfig(cwd: string, configPath?: string): TsProjectConfig {
  const resolvedConfigPath = configPath
    ? path.resolve(cwd, configPath)
    : ts.findConfigFile(cwd, ts.sys.fileExists);

  if (!resolvedConfigPath) {
    return {
      basePath: cwd,
      compilerOptions: defaultCompilerOptions(),
    };
  }

  const configFile = ts.readConfigFile(resolvedConfigPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(formatDiagnostic(configFile.error));
  }

  const basePath = path.dirname(resolvedConfigPath);
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    basePath,
    defaultCompilerOptions(),
    resolvedConfigPath,
  );

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map(formatDiagnostic).join("\n"));
  }

  return {
    configFilePath: resolvedConfigPath,
    basePath,
    compilerOptions: parsed.options,
  };
}

function defaultCompilerOptions(): ts.CompilerOptions {
  return {
    allowJs: true,
    checkJs: false,
    jsx: ts.JsxEmit.React,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    module: ts.ModuleKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
  };
}

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}
