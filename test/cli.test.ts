import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { copyFixture, run, temporaryDirectory } from "./support.js";

describe("human report", () => {
  it("shows priority, cycles, mixed branches and manual review, then fails", () => {
    const result = run(copyFixture("report-showcase"), ["src/index.js"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(
      [
        "Migration priority (3)",
        "",
        "  1. src/legacy.js  [ready, fixes mixed branch]",
        "  2. src/a.js, src/b.js  [cycle: migrate together, ready]",
        "  3. src/index.js",
        "",
        "Circular dependencies (1)",
        "",
        "  1. ┌─▶ src/a.js",
        "     │   ↓",
        "     └── src/b.js",
        "",
        "Mixed branches: TypeScript importing JavaScript (1)",
        "",
        "  1. src/feature.ts",
        "       imports src/legacy.js  [line 1]",
        "",
        "Manual review (1)",
        "",
        "  1. src/index.js:5  import(name)  [non-literal dynamic import]",
        "",
        "Summary",
        "",
        "  Progress  20%",
        "  Migrated  1 file",
        "  Total     5 files",
        "",
        '✖ 1 TypeScript file imports JavaScript. Migrate the files marked "fixes mixed branch" first.',
        "",
        "Tip: run `ts-analyze inspect <file>` to see what to migrate before a specific file, in order.",
        "",
      ].join("\n"),
    );
  });

  it("confirms a clean project and exits successfully", () => {
    const result = run(copyFixture("basic-esm"), ["src/index.js"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      [
        "Migration priority (5)",
        "",
        "  1. src/utils/date.js  [ready]",
        "  2. src/utils/math.js  [ready]",
        "  3. src/components/Button.js",
        "  4. src/services/api.js",
        "  5. src/index.js",
        "",
        "Summary",
        "",
        "  Progress  0%",
        "  Migrated  0 files",
        "  Total     5 files",
        "",
        "✔ No mixed branches: no TypeScript file imports JavaScript.",
        "",
        "Tip: run `ts-analyze inspect <file>` to see what to migrate before a specific file, in order.",
        "",
      ].join("\n"),
    );
  });

  it("says when there is nothing left to migrate", () => {
    const result = run(copyFixture("typescript-only"), ["src/index.ts"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      [
        "Migration priority (0)",
        "",
        "  Nothing to migrate: every reachable file is TypeScript.",
        "",
        "Summary",
        "",
        "  Progress  100%",
        "  Migrated  5 files",
        "  Total     5 files",
        "",
        "✔ No mixed branches: no TypeScript file imports JavaScript.",
        "",
      ].join("\n"),
    );
  });

  it("pluralizes the failure summary and rounds progress down", () => {
    const result = run(copyFixture("transitive-mixed"), ["src/main.js"]);

    // 2 of 7 files are TypeScript: 28.57% shows as 28%, never rounded up.
    expect(result.stdout).toContain("  Progress  28%\n  Migrated  2 files\n  Total     7 files\n");

    expect(result.stdout).toContain(
      '✖ 2 TypeScript files import JavaScript. Migrate the files marked "fixes mixed branch" first.',
    );
  });

  it("draws each cycle as a loop and counts group members off the shortest cycle", () => {
    const result = run(copyFixture("cycle-shapes"), ["src/index.js"]);

    expect(result.stdout).toContain(
      [
        "Circular dependencies (2)",
        "",
        "  1. ┌─▶ src/a.js",
        "     │   ↓",
        "     └── src/b.js",
        "         also in this cycle group (1):",
        "         src/c.js",
        "",
        "  2. src/self.js  [imports itself]",
      ].join("\n"),
    );
  });

  it("adds terminal colors and file hyperlinks only when color is enabled", () => {
    const root = copyFixture("typescript-middle-js-leaf");

    const colored = run(root, ["src/index.js"], { color: true });
    const plain = run(root, ["src/index.js"]);

    expect(colored.stdout).toContain("\u001b[1m");
    expect(colored.stdout).toContain(
      `\u001b]8;;${pathToFileURL(path.join(root, "src/greeting.ts")).href}\u0007src/greeting.ts\u001b]8;;\u0007`,
    );
    expect(plain.stdout).not.toContain("\u001b");
  });
});

describe("exit status", () => {
  it("does not fail on mixed branches in dry-run mode but still reports them", () => {
    const result = run(copyFixture("typescript-middle-js-leaf"), ["--dry-run", "src/index.js"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("  1. src/greeting.ts\n       imports src/punctuation.js  [line 1]");
    expect(result.stdout).toContain(
      '✖ 1 TypeScript file imports JavaScript. Migrate the files marked "fixes mixed branch" first. (dry run: not failing)',
    );
  });

  it("fails with JSON output too", () => {
    const result = run(copyFixture("typescript-middle-js-leaf"), ["--format", "json", "src/index.js"]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false });
  });

  it.each([
    { name: "no entry point", args: [], message: "Provide at least one entry point" },
    { name: "missing entry point", args: ["src/nope.js"], message: "Entry point not found: src/nope.js" },
    { name: "unknown option", args: ["--nope", "src"], message: "--nope" },
    { name: "missing config", args: ["--config", "nope.json", "src"], message: "Config file not found: nope.json" },
    { name: "bad report limit", args: ["--report-limit", "-1", "src"], message: "--report-limit" },
    { name: "bad format", args: ["--format", "xml", "src"], message: "--format" },
    { name: "inspect without a file", args: ["inspect"], message: "Provide a file to inspect" },
    { name: "inspect a directory", args: ["inspect", "src"], message: "inspect expects a single source file" },
  ])("exits with 2 for usage errors: $name", ({ args, message }) => {
    const result = run(copyFixture("basic-esm"), args);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(message);
  });

  it("exits with 2 when the tsconfig is not valid JSON", () => {
    const root = copyFixture("basic-esm");
    fs.writeFileSync(path.join(root, "tsconfig.json"), "{ compilerOptions: ");

    const result = run(root, ["src"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("tsconfig.json");
  });

  it("prints help", () => {
    const result = run(copyFixture("basic-esm"), ["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^Usage:/);
    expect(result.stdout).toContain("--dry-run");
    expect(result.stdout).toContain("ts-analyze inspect [options] <file>");
  });
});

describe("options", () => {
  it("limits every list to --report-limit items", () => {
    const result = run(copyFixture("basic-esm"), ["--report-limit", "2", "src/index.js"]);

    expect(result.stdout).toContain(
      [
        "Migration priority (5)",
        "",
        "  1. src/utils/date.js  [ready]",
        "  2. src/utils/math.js  [ready]",
        "  … 3 more (use --report-limit <n> or --no-report-limit to show more)",
        "",
      ].join("\n"),
    );
  });

  it("applies --report-limit to the extra files of a cycle group", () => {
    const root = temporaryDirectory();
    fs.mkdirSync(path.join(root, "src"));
    const imports: Record<string, string[]> = { a: ["b"], b: ["a", "c"], c: ["d"], d: ["e"], e: ["a"] };
    for (const [file, targets] of Object.entries(imports)) {
      fs.writeFileSync(path.join(root, "src", `${file}.js`), targets.map((t) => `import "./${t}.js";\n`).join(""));
    }

    const limited = run(root, ["--report-limit", "2", "src"]);
    const unlimited = run(root, ["--no-report-limit", "src"]);

    expect(limited.stdout).toContain(
      [
        "     └── src/b.js",
        "         also in this cycle group (3):",
        "         src/c.js",
        "         src/d.js",
        "         … 1 more (use --report-limit <n> or --no-report-limit to show more)",
      ].join("\n"),
    );
    expect(unlimited.stdout).toContain("         src/d.js\n         src/e.js\n");
  });

  it("limits lists to 10 items by default and can disable the limit", () => {
    const root = temporaryDirectory();
    fs.mkdirSync(path.join(root, "src"));
    for (let index = 1; index <= 12; index += 1) {
      fs.writeFileSync(path.join(root, "src", `file-${String(index).padStart(2, "0")}.js`), "export {};\n");
    }

    const limited = run(root, ["src"]);
    const unlimited = run(root, ["--no-report-limit", "src"]);

    expect(limited.stdout).toContain("  10. src/file-10.js  [ready]\n  … 2 more");
    expect(limited.stdout).not.toContain("file-11.js");
    expect(unlimited.stdout).toContain("  12. src/file-12.js  [ready]");
    expect(unlimited.stdout).not.toContain("more (use --report-limit");
  });

  it("shows paths relative to an explicit --config and uses its settings", () => {
    const fixture = copyFixture("path-alias");

    const result = run(path.dirname(fixture), ["--config", "path-alias/tsconfig.json", "path-alias/src/index.js"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("  1. src/utils/math.js  [ready]\n  2. src/index.js");
  });
});

describe("inspect", () => {
  it("lists what to migrate before a JavaScript file, stopping at TypeScript imports", () => {
    const result = run(copyFixture("transitive-mixed"), ["inspect", "src/main.js"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      [
        "src/main.js  [JavaScript]",
        "",
        "Direct imports (2)",
        "",
        "  1. src/app.ts  [TypeScript, line 1]",
        "  2. src/helpers/format.js  [JavaScript, line 2]",
        "",
        "Migration order (2)",
        "",
        "  1. src/helpers/format.js  [ready]",
        "  2. src/main.js  [this file]",
        "       imports src/helpers/format.js",
        "",
        "→ Migrate 1 file first, starting with src/helpers/format.js, then src/main.js.",
        "",
      ].join("\n"),
    );
  });

  it("lists the JavaScript to migrate to fix a TypeScript file's mixed branch, as JSON", () => {
    const result = run(copyFixture("transitive-mixed"), ["inspect", "--format", "json", "src/service.ts"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      file: "src/service.ts",
      language: "typescript",
      ready: false,
      imports: [{ file: "src/legacy/db.js", specifier: "./legacy/db.js", line: 1, language: "javascript" }],
      plan: [
        { files: ["src/legacy/conn.js"], cycle: false, ready: true, target: false, imports: [] },
        {
          files: ["src/legacy/db.js"],
          cycle: false,
          ready: false,
          target: false,
          imports: [{ file: "src/legacy/conn.js", specifier: "./conn.js", line: 1 }],
        },
      ],
      manualReview: [],
    });
  });

  it("says when a file has to be migrated together with its import cycle", () => {
    const result = run(copyFixture("cycle"), ["inspect", "src/a.js"]);

    expect(result.stdout).toBe(
      [
        "src/a.js  [JavaScript]",
        "",
        "Direct imports (1)",
        "",
        "  1. src/b.js  [JavaScript, line 1]",
        "",
        "Migration order (1)",
        "",
        "  1. src/a.js, src/b.js  [cycle: migrate together, ready, this file]",
        "",
        "→ Migrate src/a.js together with 1 other file in its import cycle.",
        "",
      ].join("\n"),
    );
  });

  it("says when a file can be migrated now", () => {
    const leaf = run(copyFixture("basic-esm"), ["inspect", "src/utils/date.js"]);
    const importsOnlyTypeScript = run(copyFixture("mixed-cycle"), ["inspect", "src/a.js"]);
    const typescript = run(copyFixture("typescript-only"), ["inspect", "src/report.ts"]);

    expect(leaf.stdout).toContain("Direct imports (0)\n\n  None.\n");
    expect(leaf.stdout).toContain("✔ src/utils/date.js can be migrated now: it imports no JavaScript.\n");
    expect(importsOnlyTypeScript.stdout).toContain("✔ src/a.js can be migrated now: it imports no JavaScript.\n");
    expect(typescript.stdout).not.toContain("Migration order");
    expect(typescript.stdout).toContain("✔ src/report.ts imports no JavaScript.\n");
  });

  it("keeps why as an alias", () => {
    const root = copyFixture("typescript-middle-js-leaf");

    expect(run(root, ["why", "src/greeting.ts"]).stdout).toBe(run(root, ["inspect", "src/greeting.ts"]).stdout);
  });
});
