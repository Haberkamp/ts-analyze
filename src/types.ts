import type ts from "typescript";

export type ImportKind = "esm" | "re-export" | "require" | "dynamic-import";

export interface ImportSpecifier {
  readonly kind: ImportKind;
  readonly specifier: string;
}

export interface ManualReviewItem {
  readonly file: string;
  readonly reason: string;
  readonly detail: string;
}

export type DependencyGraph = Map<string, Set<string>>;

export interface TsProjectConfig {
  readonly configFilePath?: string;
  readonly basePath: string;
  readonly compilerOptions: ts.CompilerOptions;
}
