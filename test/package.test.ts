import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { copyFixture, repoRoot, temporaryDirectory } from "./support.js";

const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
  readonly bin: Record<string, string>;
  readonly files: string[];
};
const binPath = path.join(repoRoot, packageJson.bin["ts-analyze"] ?? "missing");

describe("published CLI", () => {
  beforeAll(() => {
    execFileSync("npx", ["tsc", "-p", "tsconfig.json"], { cwd: repoRoot, stdio: "pipe" });
  }, 60_000);

  it("ships the built bin with a node shebang", () => {
    expect(packageJson.files).toContain("dist");
    expect(fs.readFileSync(binPath, "utf8").startsWith("#!/usr/bin/env node\n")).toBe(true);
  });

  it("runs through an npm-style bin symlink and fails on mixed branches", () => {
    const linked = path.join(temporaryDirectory(), "ts-analyze");
    fs.symlinkSync(binPath, linked);

    const result = spawnSync(process.execPath, [linked, "src/index.js"], {
      cwd: copyFixture("typescript-middle-js-leaf"),
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("1. src/greeting.ts");
    expect(result.stdout).not.toContain("\u001b");
  });

  it("prints usage errors to stderr with exit code 2", () => {
    const result = spawnSync(process.execPath, [binPath], { cwd: temporaryDirectory(), encoding: "utf8" });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Provide at least one entry point");
  });
});
