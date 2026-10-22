import type { ImportReference, ManualReviewItem } from "../domain/model.js";

/** Turns user-supplied entry points (files, directories, extensionless paths) into absolute source files. */
export interface EntryPointFinder {
  find(entries: readonly string[]): string[];
}

export interface ScannedFile {
  readonly imports: ImportReference[];
  readonly manualReview: ManualReviewItem[];
}

/** Reads one source file and lists the modules it references. */
export interface ImportScanner {
  scan(file: string): ScannedFile;
}

export type Resolution =
  /** A JavaScript or TypeScript file that belongs to the project. */
  | { readonly kind: "source"; readonly file: string }
  /** A package dependency, outside the migration. */
  | { readonly kind: "external" }
  /** Exists but is not migratable code: JSON, CSS, images, declaration-only modules. */
  | { readonly kind: "ignored" }
  /** A local reference that points nowhere. */
  | { readonly kind: "missing" };

export interface ModuleResolver {
  resolve(fromFile: string, reference: ImportReference): Resolution;
}

export interface AnalysisPorts {
  readonly entryPoints: EntryPointFinder;
  readonly scanner: ImportScanner;
  readonly resolver: ModuleResolver;
}

/** An error caused by user input; the CLI reports it without a stack trace. */
export class UsageError extends Error {}
