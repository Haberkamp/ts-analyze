import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

import type { ModuleResolver, Resolution } from "../../application/ports.js";
import type { ImportReference } from "../../domain/model.js";
import { isDeclarationFile, languageOf } from "../../domain/source-file.js";
import type { TypeScriptProject } from "./project-config.js";

const DECLARATION = /^(.*)\.d\.([cm]?)ts$/;
const PATH_SEPARATOR = /[\\/]/;

/**
 * Resolves imports the way TypeScript does for the project, then retries with permissive
 * bundler rules: a migration analysis should rather follow an import that a strict
 * resolver rejects (for example extensionless ESM that a bundler accepts) than lose it.
 */
export class TypeScriptModuleResolver implements ModuleResolver {
  private readonly caches = new Map<ts.CompilerOptions, ts.ModuleResolutionCache>();
  private readonly fallbacks = new Map<ts.CompilerOptions, ts.CompilerOptions>();

  constructor(private readonly project: TypeScriptProject) {}

  resolve(fromFile: string, reference: ImportReference): Resolution {
    const options = this.project.optionsFor(fromFile);
    const resolved =
      this.resolveWith(fromFile, reference, options) ??
      this.resolveWith(fromFile, reference, this.fallbackFor(options));

    if (resolved !== undefined) {
      return classify(resolved);
    }
    if (reference.specifier.startsWith("#") || matchesPathAlias(reference.specifier, options.paths)) {
      return { kind: "missing" };
    }
    if (reference.specifier.startsWith(".") || path.isAbsolute(reference.specifier)) {
      const target = path.resolve(path.dirname(fromFile), reference.specifier);
      return isFile(target) ? { kind: "ignored" } : { kind: "missing" };
    }
    return { kind: "external" };
  }

  private resolveWith(
    fromFile: string,
    reference: ImportReference,
    options: ts.CompilerOptions,
  ): ts.ResolvedModuleFull | undefined {
    const cache = this.cacheFor(options);
    return ts.resolveModuleName(
      reference.specifier,
      fromFile,
      options,
      ts.sys,
      cache,
      undefined,
      resolutionMode(fromFile, reference, options, cache),
    ).resolvedModule;
  }

  private cacheFor(options: ts.CompilerOptions): ts.ModuleResolutionCache {
    let cache = this.caches.get(options);
    if (cache === undefined) {
      cache = ts.createModuleResolutionCache(this.project.root, (file) => file, options);
      this.caches.set(options, cache);
    }
    return cache;
  }

  private fallbackFor(options: ts.CompilerOptions): ts.CompilerOptions {
    let fallback = this.fallbacks.get(options);
    if (fallback === undefined) {
      fallback = {
        ...options,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        resolveJsonModule: true,
        allowArbitraryExtensions: true,
      };
      this.fallbacks.set(options, fallback);
    }
    return fallback;
  }
}

/** require() and import = require() use CommonJS conditions; import() is always ESM. */
function resolutionMode(
  fromFile: string,
  reference: ImportReference,
  options: ts.CompilerOptions,
  cache: ts.ModuleResolutionCache,
): ts.ResolutionMode {
  if (reference.kind === "require") {
    return ts.ModuleKind.CommonJS;
  }
  if (reference.kind === "dynamic") {
    return ts.ModuleKind.ESNext;
  }
  return (
    ts.getImpliedNodeFormatForFile(fromFile, cache.getPackageJsonInfoCache(), ts.sys, options) ?? ts.ModuleKind.ESNext
  );
}

function classify(resolved: ts.ResolvedModuleFull): Resolution {
  const file = path.resolve(resolved.resolvedFileName);
  // isExternalLibraryImport also covers symlinked workspace packages whose real path is outside node_modules.
  if (resolved.isExternalLibraryImport || isInsideNodeModules(file)) {
    return { kind: "external" };
  }
  if (isDeclarationFile(file)) {
    // TypeScript prefers foo.d.ts over foo.js; the JavaScript behind it is what gets migrated.
    const implementation = implementationOf(file);
    return implementation === undefined ? { kind: "ignored" } : { kind: "source", file: implementation };
  }
  return languageOf(file) === undefined ? { kind: "ignored" } : { kind: "source", file };
}

function implementationOf(declaration: string): string | undefined {
  const match = DECLARATION.exec(declaration);
  if (match === null) {
    return undefined;
  }
  const [, base = "", flavor] = match;
  const extensions = flavor === "m" ? [".mjs"] : flavor === "c" ? [".cjs"] : [".js", ".jsx"];
  return extensions.map((extension) => base + extension).find(isFile);
}

/** A specifier covered by a tsconfig "paths" pattern is local code, so failing to resolve it is a mistake. */
function matchesPathAlias(specifier: string, paths: ts.MapLike<string[]> | undefined): boolean {
  // A catch-all "*" pattern (often used for custom typings) would claim every package.
  return Object.keys(paths ?? {}).some((pattern) => {
    if (pattern === "*") {
      return false;
    }
    const [prefix = "", suffix] = pattern.split("*");
    return suffix === undefined
      ? specifier === pattern
      : specifier.length >= prefix.length + suffix.length && specifier.startsWith(prefix) && specifier.endsWith(suffix);
  });
}

function isInsideNodeModules(file: string): boolean {
  return file.split(PATH_SEPARATOR).includes("node_modules");
}

function isFile(file: string): boolean {
  return fs.statSync(file, { throwIfNoEntry: false })?.isFile() ?? false;
}
