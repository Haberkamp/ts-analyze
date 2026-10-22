export type Language = "typescript" | "javascript";

const TYPESCRIPT_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];
const JAVASCRIPT_EXTENSIONS = [".js", ".jsx", ".mjs", ".cjs"];

export const SOURCE_EXTENSIONS = [...TYPESCRIPT_EXTENSIONS, ...JAVASCRIPT_EXTENSIONS];

/** Matches foo.d.ts, foo.d.mts, foo.d.cts and arbitrary-extension declarations like foo.d.css.ts. */
export function isDeclarationFile(file: string): boolean {
  return /\.d\.([^./\\]+\.)?[cm]?ts$/.test(file);
}

/** Returns the language of a migratable source file, or undefined for declarations and non-code files. */
export function languageOf(file: string): Language | undefined {
  if (isDeclarationFile(file)) {
    return undefined;
  }
  const extension = /\.[^./\\]+$/.exec(file)?.[0];
  if (extension === undefined) {
    return undefined;
  }
  if (TYPESCRIPT_EXTENSIONS.includes(extension)) {
    return "typescript";
  }
  if (JAVASCRIPT_EXTENSIONS.includes(extension)) {
    return "javascript";
  }
  return undefined;
}
