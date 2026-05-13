import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { isCliEntryPoint } from "./src/index.js";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

describe("npm package metadata", () => {
  it("publishes a built CLI entry point for npx", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    ) as {
      readonly bin?: Record<string, string>;
      readonly files?: string[];
      readonly scripts?: Record<string, string>;
    };

    expect(packageJson.bin).toEqual({ "ts-analyze": "dist/index.js" });
    expect(packageJson.files).toContain("dist");
    expect(packageJson.scripts?.prepack).toBe("npm run build");
  });

  it("keeps the compiled bin target executable by Node", () => {
    const source = fs.readFileSync(path.join(repoRoot, "src", "index.ts"), "utf8");

    expect(source.startsWith("#!/usr/bin/env node\n")).toBe(true);
  });

  it("recognizes npm bin symlinks as CLI entry points", () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyze-bin-"));
    const sourceEntryPoint = path.join(repoRoot, "src", "index.ts");
    const linkedEntryPoint = path.join(temporaryRoot, "ts-analyze");

    try {
      fs.symlinkSync(sourceEntryPoint, linkedEntryPoint);

      expect(
        isCliEntryPoint(linkedEntryPoint, pathToFileURL(sourceEntryPoint).href),
      ).toBe(true);
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});
