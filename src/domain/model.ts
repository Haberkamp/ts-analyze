/** How a module is referenced; adapters use it to pick ESM or CommonJS resolution rules. */
export type ImportKind = "static" | "require" | "dynamic" | "type";

export interface ImportReference {
  readonly specifier: string;
  readonly kind: ImportKind;
  readonly line: number;
}

export interface Dependency {
  readonly file: string;
  readonly specifier: string;
  readonly line: number;
}

export interface ManualReviewItem {
  readonly file: string;
  readonly line: number;
  readonly reason: string;
  readonly detail: string;
}

/** Every reachable source file mapped to the source files it imports, in source order. */
export type ModuleGraph = ReadonlyMap<string, readonly Dependency[]>;

export interface PriorityStep {
  /** JavaScript files to migrate in this step; more than one means a cycle group. */
  readonly files: string[];
  readonly cycle: boolean;
  /** No file in the step imports JavaScript outside the step. */
  readonly ready: boolean;
  /** Migrating this step is required before every mixed branch can be fixed. */
  readonly fixesMixedBranch: boolean;
  /** Files outside the step that import it. */
  readonly importedBy: number;
}

export interface Cycle {
  readonly files: string[];
  /** Shortest cycle through the first file, ending where it starts. */
  readonly path: string[];
}

export interface MixedBranch {
  readonly file: string;
  readonly imports: Dependency[];
}

export interface Analysis {
  readonly summary: {
    readonly files: number;
    readonly javascript: number;
    readonly typescript: number;
  };
  readonly priority: PriorityStep[];
  readonly cycles: Cycle[];
  readonly mixedBranches: MixedBranch[];
  readonly manualReview: ManualReviewItem[];
}

interface MigrationStep {
  /** JavaScript files to migrate in this step; more than one means a cycle group. */
  readonly files: string[];
  readonly cycle: boolean;
  /** JavaScript outside the step that it imports; empty means the step is ready. */
  readonly imports: Dependency[];
}

/** What to migrate, in order, before one file can be TypeScript without importing JavaScript. */
export interface FilePlan {
  readonly file: string;
  /** The file imports no JavaScript. */
  readonly ready: boolean;
  /** Source files it imports directly: one entry per file, in source order. */
  readonly imports: Dependency[];
  /** Dependencies first. Ends with the file itself (or its cycle group) when it is JavaScript. */
  readonly plan: MigrationStep[];
}
