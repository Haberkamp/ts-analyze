import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

import { UsageError } from "../../application/ports.js";

export interface TypeScriptProject {
  /** Directory that report paths are relative to: the config's directory, or the cwd without one. */
  readonly root: string;
  /** Compiler options of the (referenced) project that includes the file, else the root config's. */
  optionsFor(file: string): ts.CompilerOptions;
}

const CONFIG_NAMES = ["tsconfig.json", "jsconfig.json"];
const FILE_NOT_FOUND = 6053;

const DEFAULT_OPTIONS: ts.CompilerOptions = {
  module: ts.ModuleKind.Preserve,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
};

export function loadTypeScriptProject(cwd: string, configPath?: string): TypeScriptProject {
  const configFile = configPath === undefined ? findConfigFile(cwd) : explicitConfigFile(cwd, configPath);
  if (configFile === undefined) {
    return { root: cwd, optionsFor: () => DEFAULT_OPTIONS };
  }

  const projects = parseWithReferences(configFile);
  const rootOptions = projects[0]?.options ?? DEFAULT_OPTIONS;
  return {
    root: path.dirname(configFile),
    optionsFor: (file) => projects.find((project) => project.files.has(file))?.options ?? rootOptions,
  };
}

function explicitConfigFile(cwd: string, configPath: string): string {
  const file = path.resolve(cwd, configPath);
  if (!fs.existsSync(file)) {
    throw new UsageError(`Config file not found: ${configPath}`);
  }
  return fs.realpathSync(file);
}

function findConfigFile(cwd: string): string | undefined {
  for (let directory = cwd; ; directory = path.dirname(directory)) {
    for (const name of CONFIG_NAMES) {
      const candidate = path.join(directory, name);
      if (fs.existsSync(candidate)) {
        return fs.realpathSync(candidate);
      }
    }
    if (path.dirname(directory) === directory) {
      return undefined;
    }
  }
}

interface ParsedProject {
  readonly options: ts.CompilerOptions;
  readonly files: Set<string>;
}

/** Parses a config and, for solution-style setups, every project it references. */
function parseWithReferences(rootConfig: string): ParsedProject[] {
  const projects: ParsedProject[] = [];
  const pending = [rootConfig];
  const seen = new Set<string>();

  for (let configFile = pending.shift(); configFile !== undefined; configFile = pending.shift()) {
    if (seen.has(configFile) || !fs.existsSync(configFile)) {
      continue;
    }
    seen.add(configFile);
    const parsed = parseConfig(configFile);
    projects.push({
      options: parsed.options,
      files: new Set(parsed.fileNames.map((file) => path.resolve(file))),
    });
    for (const reference of parsed.projectReferences ?? []) {
      pending.push(path.resolve(ts.resolveProjectReferencePath(reference)));
    }
  }
  return projects;
}

function parseConfig(configFile: string): ts.ParsedCommandLine {
  const read = ts.readConfigFile(configFile, ts.sys.readFile);
  if (read.error) {
    throw new UsageError(`Invalid config ${configFile}: ${formatDiagnostic(read.error)}`);
  }
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    path.dirname(configFile),
    undefined,
    configFile,
  );
  // Only a missing file (e.g. an unresolvable "extends") changes resolution; option-level
  // diagnostics such as "no inputs found" or options from other TypeScript versions do not.
  const fatal = parsed.errors.find((diagnostic) => diagnostic.code === FILE_NOT_FOUND);
  if (fatal) {
    throw new UsageError(`Invalid config ${configFile}: ${formatDiagnostic(fatal)}`);
  }
  return parsed;
}

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}
