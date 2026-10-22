import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { analyzeFixture, priorityFiles, run, temporaryDirectory } from "./support.js";
import type { JsonReport } from "./support.js";

describe("migration priority", () => {
  it("orders ESM leaves before the modules that import them", () => {
    const { report } = analyzeFixture("basic-esm", ["src/index.js"]);

    expect(priorityFiles(report)).toEqual([
      ["src/utils/date.js"],
      ["src/utils/math.js"],
      ["src/components/Button.js"],
      ["src/services/api.js"],
      ["src/index.js"],
    ]);
    expect(report.priority.map((step) => step.ready)).toEqual([true, true, false, false, false]);
  });

  it("follows require() chains in CommonJS projects", () => {
    const { report } = analyzeFixture("commonjs", ["src/index.js"]);

    expect(priorityFiles(report)).toEqual([["src/text.js"], ["src/message.js"], ["src/index.js"]]);
  });

  it("puts barrels after everything they re-export and before their consumers", () => {
    const { report } = analyzeFixture("re-exports", ["src/index.js"]);

    expect(priorityFiles(report)).toEqual([
      ["src/label.js"],
      ["src/number.js"],
      ["src/feature.js"],
      ["src/barrel.js"],
      ["src/index.js"],
    ]);
  });

  it("ranks widely imported files first among files that are equally ready", () => {
    const { report } = analyzeFixture("multiple-entrypoints", ["src/pages"]);

    expect(priorityFiles(report)).toEqual([
      ["src/components/Layout.js"],
      ["src/components/Button.js"],
      ["src/pages/about.js"],
      ["src/pages/home.js"],
    ]);
    expect(report.priority.map((step) => step.importedBy)).toEqual([2, 1, 0, 0]);
  });

  it("collects entry points from nested directories", () => {
    const { report } = analyzeFixture("multiple-entrypoints-nested", ["src/pages"]);

    expect(priorityFiles(report)).toEqual([
      ["src/components/Layout.js"],
      ["src/components/Button.js"],
      ["src/components/Card.js"],
      ["src/pages/admin/settings.js"],
      ["src/pages/blog/post.js"],
      ["src/pages/home.js"],
    ]);
  });

  it("orders JavaScript after the TypeScript leaves it imports and marks it ready", () => {
    const { exitCode, report } = analyzeFixture("typescript-leaves", ["src/index.js"]);

    expect(exitCode).toBe(0);
    expect(priorityFiles(report)).toEqual([["src/summary.js"], ["src/index.js"]]);
    expect(report.priority.map((step) => step.ready)).toEqual([true, false]);
  });

  it("reports nothing to migrate in a TypeScript-only project", () => {
    const { exitCode, report } = analyzeFixture("typescript-only", ["src/index.ts"]);

    expect(exitCode).toBe(0);
    expect(report.ok).toBe(true);
    expect(report.priority).toEqual([]);
    expect(report.summary).toEqual({ files: 5, javascript: 0, typescript: 5 });
  });

  it("puts files needed to fix a mixed branch before unrelated work", () => {
    const { report } = analyzeFixture("transitive-mixed", ["src/main.js"]);

    expect(priorityFiles(report)).toEqual([
      ["src/legacy/conn.js"],
      ["src/util.js"],
      ["src/legacy/db.js"],
      ["src/helpers/format.js"],
      ["src/main.js"],
    ]);
    expect(report.priority.map((step) => step.fixesMixedBranch)).toEqual([true, true, true, false, false]);
  });

  it("handles import chains deeper than the call stack", () => {
    const root = temporaryDirectory();
    const length = 20_000;
    fs.mkdirSync(path.join(root, "src"));
    fs.writeFileSync(
      path.join(root, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { allowJs: true, module: "NodeNext", moduleResolution: "NodeNext" } }),
    );
    for (let index = 0; index < length; index += 1) {
      fs.writeFileSync(path.join(root, "src", `f${index}.js`), `import "./f${index + 1}.js";\n`);
    }
    fs.writeFileSync(path.join(root, "src", `f${length}.js`), "export {};\n");

    const result = run(root, ["--format", "json", "src/f0.js"]);
    const report = JSON.parse(result.stdout) as JsonReport;

    expect(result.exitCode).toBe(0);
    expect(report.priority).toHaveLength(length + 1);
    expect(report.priority[0]?.files).toEqual([`src/f${length}.js`]);
    expect(report.priority.at(-1)?.files).toEqual(["src/f0.js"]);
  }, 60_000);
});

describe("mixed branches (TypeScript importing JavaScript)", () => {
  it("fails when a TypeScript file imports a JavaScript file", () => {
    const { exitCode, report } = analyzeFixture("typescript-middle-js-leaf", ["src/index.js"]);

    expect(exitCode).toBe(1);
    expect(report.ok).toBe(false);
    expect(report.mixedBranches).toEqual([
      {
        file: "src/greeting.ts",
        imports: [{ file: "src/punctuation.js", specifier: "./punctuation.js", line: 1 }],
      },
    ]);
    expect(report.priority).toEqual([
      { files: ["src/punctuation.js"], cycle: false, ready: true, fixesMixedBranch: true, importedBy: 1 },
      { files: ["src/index.js"], cycle: false, ready: true, fixesMixedBranch: false, importedBy: 0 },
    ]);
  });

  it("reports every mixed branch, not only those directly below an entry point", () => {
    const { exitCode, report } = analyzeFixture("transitive-mixed", ["src/main.js"]);

    expect(exitCode).toBe(1);
    expect(report.mixedBranches).toEqual([
      { file: "src/app.ts", imports: [{ file: "src/util.js", specifier: "./util.js", line: 2 }] },
      {
        file: "src/service.ts",
        imports: [{ file: "src/legacy/db.js", specifier: "./legacy/db.js", line: 1 }],
      },
    ]);
  });

  it("sees JavaScript behind a .d.ts / .d.mts sidecar declaration", () => {
    const { exitCode, report } = analyzeFixture("dts-sidecar", ["src/index.ts"]);

    expect(exitCode).toBe(1);
    expect(report.mixedBranches).toEqual([
      {
        file: "src/index.ts",
        imports: [
          { file: "src/legacy.js", specifier: "./legacy.js", line: 1 },
          { file: "src/config.mjs", specifier: "./config.mjs", line: 2 },
        ],
      },
    ]);
    expect(priorityFiles(report)).toEqual([["src/config.mjs"], ["src/legacy.js"]]);
  });

  it("does not treat declaration-only modules as JavaScript", () => {
    const { exitCode, report } = analyzeFixture("declaration-only", ["src/index.ts"]);

    expect(exitCode).toBe(0);
    expect(report.mixedBranches).toEqual([]);
    expect(report.priority).toEqual([]);
    expect(report.manualReview).toEqual([]);
  });

  it("treats .mts/.cts as TypeScript and .mjs/.cjs as JavaScript", () => {
    const { exitCode, report } = analyzeFixture("mts-cts", ["src/index.mjs"]);

    expect(exitCode).toBe(1);
    expect(report.summary).toEqual({ files: 5, javascript: 3, typescript: 2 });
    expect(report.mixedBranches).toEqual([
      { file: "src/common.cts", imports: [{ file: "src/leaf.cjs", specifier: "./leaf.cjs", line: 1 }] },
      { file: "src/esm.mts", imports: [{ file: "src/leaf.mjs", specifier: "./leaf.mjs", line: 1 }] },
    ]);
    expect(priorityFiles(report)).toEqual([["src/leaf.cjs"], ["src/leaf.mjs"], ["src/index.mjs"]]);
  });

  it("detects TS-only module syntax: import = require, import type, export type, typeof import()", () => {
    const { exitCode, report } = analyzeFixture("typescript-module-syntax", ["src/index.ts"]);

    expect(exitCode).toBe(1);
    expect(report.mixedBranches).toEqual([
      {
        file: "src/index.ts",
        imports: [
          { file: "src/legacy-require.js", specifier: "./legacy-require", line: 1 },
          { file: "src/legacy-types.js", specifier: "./legacy-types.js", line: 2 },
          { file: "src/legacy-shapes.js", specifier: "./legacy-shapes.js", line: 3 },
          { file: "src/legacy-config.js", specifier: "./legacy-config.js", line: 4 },
        ],
      },
    ]);
  });

  it("detects TSX importing JSX", () => {
    const { exitCode, report } = analyzeFixture("jsx-tsx", ["src/App.jsx"]);

    expect(exitCode).toBe(1);
    expect(report.mixedBranches).toEqual([
      { file: "src/Header.tsx", imports: [{ file: "src/Logo.jsx", specifier: "./Logo", line: 1 }] },
    ]);
    expect(priorityFiles(report)).toEqual([["src/Logo.jsx"], ["src/Footer.jsx"], ["src/App.jsx"]]);
  });

  it("detects JavaScript imports even when the tsconfig does not enable allowJs", () => {
    const { exitCode, report } = analyzeFixture("allow-js-disabled", ["src/index.ts"]);

    expect(exitCode).toBe(1);
    expect(report.mixedBranches).toEqual([
      { file: "src/index.ts", imports: [{ file: "src/legacy.js", specifier: "./legacy.js", line: 1 }] },
    ]);
  });

  it("follows .ts extension imports used with Node type stripping", () => {
    const { exitCode, report } = analyzeFixture("ts-extension-imports", ["src/index.ts"]);

    expect(exitCode).toBe(1);
    expect(report.mixedBranches).toEqual([
      { file: "src/util.ts", imports: [{ file: "src/legacy.js", specifier: "./legacy.js", line: 1 }] },
    ]);
  });

  it("ignores JavaScript that comes from packages in node_modules, including symlinked workspaces", () => {
    const { exitCode, report } = analyzeFixture("external-packages", ["src/index.ts"]);

    expect(exitCode).toBe(0);
    expect(report.summary).toEqual({ files: 1, javascript: 0, typescript: 1 });
    expect(report.mixedBranches).toEqual([]);
    expect(report.manualReview).toEqual([]);
  });
});

describe("circular dependencies", () => {
  it("groups a JavaScript cycle into one migration step", () => {
    const { report } = analyzeFixture("cycle", ["src/index.js"]);

    expect(report.priority).toEqual([
      { files: ["src/a.js", "src/b.js"], cycle: true, ready: true, fixesMixedBranch: false, importedBy: 1 },
      { files: ["src/index.js"], cycle: false, ready: false, fixesMixedBranch: false, importedBy: 0 },
    ]);
    expect(report.cycles).toEqual([{ files: ["src/a.js", "src/b.js"], path: ["src/a.js", "src/b.js", "src/a.js"] }]);
  });

  it("shows cycles that cross the JS/TS boundary and flags the mixed branch inside them", () => {
    const { exitCode, report } = analyzeFixture("mixed-cycle", ["src/index.js"]);

    expect(exitCode).toBe(1);
    expect(report.cycles).toEqual([{ files: ["src/a.js", "src/b.ts"], path: ["src/a.js", "src/b.ts", "src/a.js"] }]);
    expect(report.mixedBranches).toEqual([
      { file: "src/b.ts", imports: [{ file: "src/a.js", specifier: "./a.js", line: 1 }] },
    ]);
    expect(report.priority[0]).toEqual({
      files: ["src/a.js"],
      cycle: true,
      ready: true,
      fixesMixedBranch: true,
      importedBy: 1,
    });
  });

  it("shows cycles between TypeScript files", () => {
    const { exitCode, report } = analyzeFixture("typescript-cycle", ["src/index.js"]);

    expect(exitCode).toBe(0);
    expect(report.cycles).toEqual([{ files: ["src/a.ts", "src/b.ts"], path: ["src/a.ts", "src/b.ts", "src/a.ts"] }]);
    expect(priorityFiles(report)).toEqual([["src/index.js"]]);
  });

  it("reports self-imports and groups larger than their shortest cycle", () => {
    const { report } = analyzeFixture("cycle-shapes", ["src/index.js"]);

    expect(report.cycles).toEqual([
      { files: ["src/a.js", "src/b.js", "src/c.js"], path: ["src/a.js", "src/b.js", "src/a.js"] },
      { files: ["src/self.js"], path: ["src/self.js", "src/self.js"] },
    ]);
    expect(priorityFiles(report)).toEqual([["src/a.js", "src/b.js", "src/c.js"], ["src/self.js"], ["src/index.js"]]);
    expect(report.priority.map((step) => step.cycle)).toEqual([true, true, false]);
  });
});

describe("TypeScript and JavaScript configuration", () => {
  it("resolves tsconfig paths aliases with baseUrl and flags aliases that point nowhere", () => {
    const { report } = analyzeFixture("path-alias", ["src/index.js"]);

    expect(priorityFiles(report)).toEqual([["src/utils/math.js"], ["src/index.js"]]);
    expect(report.manualReview).toEqual([
      { file: "src/index.js", line: 2, reason: "unresolved import", detail: "@utils/missing" },
    ]);
  });

  it("resolves bare imports through baseUrl", () => {
    const { report } = analyzeFixture("base-url", ["src/index.js"]);

    expect(priorityFiles(report)).toEqual([["src/utils/math.js"], ["src/index.js"]]);
  });

  it("reads paths from an extended config that has comments and trailing commas", () => {
    const { report } = analyzeFixture("tsconfig-extends", ["src/index.ts"]);

    expect(report.mixedBranches).toEqual([
      { file: "src/index.ts", imports: [{ file: "src/legacy.js", specifier: "~/legacy", line: 1 }] },
    ]);
  });

  it("uses the referenced project of a solution-style tsconfig", () => {
    const { report } = analyzeFixture("solution-style", ["src/main.ts"]);

    expect(report.summary).toEqual({ files: 3, javascript: 1, typescript: 2 });
    expect(report.mixedBranches).toEqual([
      { file: "src/main.ts", imports: [{ file: "src/legacy.js", specifier: "@/legacy", line: 1 }] },
    ]);
  });

  it("uses jsconfig.json when there is no tsconfig.json", () => {
    const { report } = analyzeFixture("jsconfig-paths", ["src/index.js"]);

    expect(priorityFiles(report)).toEqual([["src/lib/math.js"], ["src/index.js"]]);
  });

  it("does not crash when the tsconfig include matches no files", () => {
    const { exitCode, report } = analyzeFixture("tsconfig-no-inputs", ["src/index.js"]);

    expect(exitCode).toBe(0);
    expect(priorityFiles(report)).toEqual([["src/util.js"], ["src/index.js"]]);
  });

  it("resolves package.json imports subpath patterns", () => {
    const { report } = analyzeFixture("package-imports", ["src/index.js"]);

    expect(priorityFiles(report)).toEqual([["src/lib/math.js"], ["src/index.js"]]);
  });

  it("uses import and require conditions for ESM and CommonJS importers", () => {
    const { report } = analyzeFixture("conditional-imports", ["src/index.mjs", "src/legacy.cjs"]);

    expect(priorityFiles(report)).toEqual([["src/dep.cjs"], ["src/dep.mjs"], ["src/index.mjs"], ["src/legacy.cjs"]]);
  });

  it("resolves extensionless and directory index imports with bundler resolution", () => {
    const { report } = analyzeFixture("bundler-extensionless", ["src/index.ts"]);

    expect(report.mixedBranches).toEqual([
      {
        file: "src/index.ts",
        imports: [
          { file: "src/utils/index.js", specifier: "./utils", line: 1 },
          { file: "src/format.js", specifier: "./format", line: 2 },
        ],
      },
    ]);
  });

  it("still finds extensionless imports in a NodeNext ESM package", () => {
    const { report } = analyzeFixture("nodenext-extensionless", ["src/index.js"]);

    expect(priorityFiles(report)).toEqual([["src/util.js"], ["src/index.js"]]);
  });
});

describe("import syntax", () => {
  it("handles nested, template-literal and re-exported require() calls", () => {
    const { report } = analyzeFixture("commonjs-patterns", ["src/index.js"]);

    expect(priorityFiles(report)).toEqual([
      ["src/direct.js"],
      ["src/lazy.js"],
      ["src/reexported.js"],
      ["src/templated.js"],
      ["src/index.js"],
    ]);
    expect(report.manualReview).toEqual([
      { file: "src/index.js", line: 5, reason: "non-literal require", detail: "require(name)" },
    ]);
  });

  it("ignores import-like text in comments and strings", () => {
    const { report } = analyzeFixture("comments-and-strings", ["src/index.js"]);

    expect(priorityFiles(report)).toEqual([["src/real.js"], ["src/index.js"]]);
  });

  it("follows literal dynamic imports and flags non-literal ones for manual review", () => {
    const { report } = analyzeFixture("dynamic", ["src/index.js"]);

    expect(priorityFiles(report)).toEqual([["src/literal-feature.js"], ["src/index.js"]]);
    expect(report.manualReview).toEqual([
      {
        file: "src/index.js",
        line: 3,
        reason: "non-literal dynamic import",
        detail: "import(`./${name}.js`)",
      },
    ]);
  });

  it("ignores packages and flags missing local files for manual review", () => {
    const { report } = analyzeFixture("unresolved", ["src/index.js"]);

    expect(priorityFiles(report)).toEqual([["src/existing.js"], ["src/index.js"]]);
    expect(report.manualReview).toEqual([
      { file: "src/index.js", line: 3, reason: "unresolved import", detail: "./missing.js" },
    ]);
  });

  it("ignores JSON and asset imports but flags missing assets", () => {
    const { report } = analyzeFixture("json-and-assets", ["src/index.js"]);

    expect(report.summary).toEqual({ files: 1, javascript: 1, typescript: 0 });
    expect(priorityFiles(report)).toEqual([["src/index.js"]]);
    expect(report.manualReview).toEqual([
      { file: "src/index.js", line: 4, reason: "unresolved import", detail: "./missing.css" },
    ]);
  });
});

describe("entry points", () => {
  it("walks directories but skips node_modules, hidden folders and declaration files", () => {
    const { report } = analyzeFixture("directory-entry", ["."]);

    expect(report.summary).toEqual({ files: 3, javascript: 3, typescript: 0 });
    expect(priorityFiles(report)).toEqual([["src/lib/helper.js"], ["src/lib/standalone.js"], ["src/index.js"]]);
  });

  it("accepts extensionless entry points", () => {
    const { report } = analyzeFixture("commonjs", ["src/index"]);

    expect(priorityFiles(report)).toEqual([["src/text.js"], ["src/message.js"], ["src/index.js"]]);
  });

  it("accepts repeated --entry options", () => {
    const { report } = analyzeFixture("multiple-entrypoints", [
      "--entry",
      "src/pages/home.js",
      "--entry",
      "src/pages/about.js",
    ]);

    expect(priorityFiles(report)).toEqual([
      ["src/components/Layout.js"],
      ["src/components/Button.js"],
      ["src/pages/about.js"],
      ["src/pages/home.js"],
    ]);
  });
});
