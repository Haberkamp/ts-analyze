import fs from "node:fs";
import path from "node:path";

import { UsageError } from "../../application/ports.js";
import type { EntryPointFinder } from "../../application/ports.js";
import { SOURCE_EXTENSIONS, languageOf } from "../../domain/source-file.js";

export class FileSystemEntryPointFinder implements EntryPointFinder {
  constructor(private readonly cwd: string) {}

  find(entries: readonly string[]): string[] {
    const files = new Set<string>();
    for (const entry of entries) {
      for (const file of this.expand(entry)) {
        files.add(file);
      }
    }
    return [...files];
  }

  private expand(entry: string): string[] {
    const target = path.resolve(this.cwd, entry);
    const stat = fs.statSync(target, { throwIfNoEntry: false });

    if (stat?.isDirectory()) {
      return walk(fs.realpathSync(target));
    }
    if (stat?.isFile()) {
      if (languageOf(target) === undefined) {
        throw new UsageError(`Entry point is not a JavaScript or TypeScript source file: ${entry}`);
      }
      return [fs.realpathSync(target)];
    }
    const withExtension = SOURCE_EXTENSIONS.map((extension) => target + extension).find(
      (candidate) => fs.statSync(candidate, { throwIfNoEntry: false })?.isFile() ?? false,
    );
    if (withExtension === undefined) {
      throw new UsageError(`Entry point not found: ${entry}`);
    }
    return [fs.realpathSync(withExtension)];
  }
}

/** Source files below a directory, skipping node_modules and hidden folders such as .git or .cache. */
function walk(directory: string): string[] {
  const files: string[] = [];
  const pending = [directory];
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && !entry.name.startsWith(".")) {
          pending.push(entryPath);
        }
      } else if (entry.isFile() && languageOf(entryPath) !== undefined) {
        files.push(entryPath);
      }
    }
  }
  return files.sort();
}
