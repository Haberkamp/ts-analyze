import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { loadTsConfig } from "./src/config.js";
import { buildDependencyGraph } from "./src/graph.js";
import { runCli } from "./src/index.js";
import { determineMigrationOrder } from "./src/order.js";
import {
  formatMigrationReport,
  formatWhyReport,
} from "./src/report.js";
import type { ReportInput } from "./src/report.js";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(repoRoot, "fixtures");
const temporaryFixtures: string[] = [];

afterEach(() => {
  for (const fixtureRoot of temporaryFixtures.splice(0)) {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

describe("fixtures", () => {
  for (const fixtureName of fixtureNames()) {
    it(`matches the migration report snapshot for ${fixtureName}`, () => {
      const fixtureRoot = path.join(fixturesRoot, fixtureName);
      const entryPoints = entryPointsForFixture(fixtureRoot);
      const configPath = path.relative(
        repoRoot,
        path.join(fixtureRoot, "tsconfig.json"),
      );

      const projectConfig = loadTsConfig(repoRoot, configPath);
      const graphResult = buildDependencyGraph(
        entryPoints,
        projectConfig,
        repoRoot,
      );
      const plan = determineMigrationOrder(graphResult.graph);

      expect(
        formatMigrationReport({
          plan,
          graph: graphResult.graph,
          manualReview: graphResult.manualReview,
          basePath: projectConfig.basePath,
        }),
      ).toMatchSnapshot();
    });
  }
});

describe("TypeScript files with JavaScript dependencies", () => {
  it("prints only the problematic TypeScript file name in the report", () => {
    const fixtureRoot = path.join(fixturesRoot, "typescript-middle-js-leaf");
    const { graphResult, plan, projectConfig } = analyzeFixture(fixtureRoot);

    expect(
      formatMigrationReport({
        plan,
        graph: graphResult.graph,
        manualReview: graphResult.manualReview,
        basePath: projectConfig.basePath,
      }),
    ).toContain(
      [
        "Warning: TypeScript Files With JavaScript Dependencies:",
        "1. src/greeting.ts",
        "Info: Run `ts-analyze why <file>` to explain why a listed TypeScript file is non-leaf.",
      ].join("\n"),
    );
    expect(
      formatMigrationReport({
        plan,
        graph: graphResult.graph,
        manualReview: graphResult.manualReview,
        basePath: projectConfig.basePath,
      }),
    ).not.toContain("src/greeting.ts -> src/punctuation.js");
  });

  it("explains why a requested TypeScript file is listed", () => {
    const fixtureRoot = path.join(fixturesRoot, "typescript-middle-js-leaf");
    const { graphResult, projectConfig } = analyzeFixture(fixtureRoot);

    expect(
      formatWhyReport({
        file: path.join(fixtureRoot, "src", "greeting.ts"),
        graph: graphResult.graph,
        basePath: projectConfig.basePath,
      }),
    ).toBe(
      [
        "Why src/greeting.ts is listed:",
        "1. src/greeting.ts imports src/punctuation.js",
        "2. src/punctuation.js is JavaScript, so src/greeting.ts is not a TypeScript leaf.",
      ].join("\n"),
    );
  });

  it("supports the why subcommand", () => {
    expect(
      runCli(
        [
          "--config",
          "fixtures/typescript-middle-js-leaf/tsconfig.json",
          "why",
          "fixtures/typescript-middle-js-leaf/src/greeting.ts",
        ],
        repoRoot,
      ),
    ).toBe(
      [
        "Why src/greeting.ts is listed:",
        "1. src/greeting.ts imports src/punctuation.js",
        "2. src/punctuation.js is JavaScript, so src/greeting.ts is not a TypeScript leaf.",
      ].join("\n"),
    );
  });
});

describe("report limits", () => {
  it("limits each report section to 10 by default and prints guidance for truncated sections", () => {
    const report = formatMigrationReport(
      makeReportInput({
        stepCount: 11,
        cycleCount: 11,
        typeScriptWarningCount: 11,
        manualReviewCount: 11,
      }),
    );

    expect(report).toContain("10. src/file-10.js");
    expect(report).not.toContain("src/file-11.js");
    expect(report).toContain("10. src/cycle-10-a.js, src/cycle-10-b.js");
    expect(report).not.toContain("src/cycle-11-a.js");
    expect(report).toContain("10. src/ts-warning-10.ts");
    expect(report).not.toContain("src/ts-warning-11.ts");
    expect(report).toContain("10. src/manual-10.js - dynamic import: import(expr)");
    expect(report).not.toContain("src/manual-11.js");
    expect(
      countOccurrences(
        report,
        "Info: Showing 10 of 11 reports. Configure with `--report-limit <number>` or disable with `--no-report-limit`.",
      ),
    ).toBe(4);
  });

  it("does not print limit guidance when a section does not exceed the limit", () => {
    const report = formatMigrationReport(makeReportInput({ stepCount: 10 }));

    expect(report).toContain("10. src/file-10.js");
    expect(report).not.toContain("Configure with `--report-limit <number>`");
  });

  it("uses a configured numeric report limit", () => {
    const report = formatMigrationReport(
      makeReportInput({ stepCount: 3, reportLimit: 2 }),
    );

    expect(report).toContain("1. src/file-01.js");
    expect(report).toContain("2. src/file-02.js");
    expect(report).not.toContain("src/file-03.js");
    expect(report).toContain(
      "Info: Showing 2 of 3 reports. Configure with `--report-limit <number>` or disable with `--no-report-limit`.",
    );
  });

  it("can disable report limits", () => {
    const report = formatMigrationReport(
      makeReportInput({ stepCount: 11, reportLimit: false }),
    );

    expect(report).toContain("11. src/file-11.js");
    expect(report).not.toContain("Configure with `--report-limit <number>`");
  });

  it("supports configuring the report limit from the CLI", () => {
    const fixtureRoot = createReportLimitFixture();

    expect(runCli(["--report-limit", "2", "src"], fixtureRoot)).toBe(
      [
        "Migration Order:",
        "1. src/file-01.js",
        "2. src/file-02.js",
        "Info: Showing 2 of 12 reports. Configure with `--report-limit <number>` or disable with `--no-report-limit`.",
      ].join("\n"),
    );
  });

  it("supports disabling the report limit from the CLI", () => {
    const fixtureRoot = createReportLimitFixture();

    const report = runCli(["--no-report-limit", "src"], fixtureRoot);

    expect(report).toContain("11. src/file-11.js");
    expect(report).toContain("12. src/file-12.js");
    expect(report).not.toContain("Configure with `--report-limit <number>`");
  });
});

function fixtureNames(): string[] {
  return fs
    .readdirSync(fixturesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) =>
      fs.existsSync(path.join(fixturesRoot, entry.name, "tsconfig.json")),
    )
    .map((entry) => entry.name)
    .sort();
}

function entryPointsForFixture(fixtureRoot: string): string[] {
  const pagesDir = path.join(fixtureRoot, "src", "pages");
  if (!fs.existsSync(pagesDir)) {
    return [path.join(fixtureRoot, "src", "index")];
  }

  return [pagesDir];
}

function analyzeFixture(fixtureRoot: string): {
  readonly graphResult: ReturnType<typeof buildDependencyGraph>;
  readonly plan: ReturnType<typeof determineMigrationOrder>;
  readonly projectConfig: ReturnType<typeof loadTsConfig>;
} {
  const projectConfig = loadTsConfig(
    repoRoot,
    path.relative(repoRoot, path.join(fixtureRoot, "tsconfig.json")),
  );
  const graphResult = buildDependencyGraph(
    entryPointsForFixture(fixtureRoot),
    projectConfig,
    repoRoot,
  );
  const plan = determineMigrationOrder(graphResult.graph);

  return { graphResult, plan, projectConfig };
}

interface ReportLimitTestOptions {
  readonly stepCount?: number;
  readonly cycleCount?: number;
  readonly typeScriptWarningCount?: number;
  readonly manualReviewCount?: number;
  readonly reportLimit?: number | false;
}

function makeReportInput(options: ReportLimitTestOptions): ReportInput & {
  readonly reportLimit?: number | false;
} {
  const basePath = path.join(repoRoot, "virtual");
  const graph = new Map<string, Set<string>>();
  const steps: ReportInput["plan"]["steps"] = [];
  const cycles: ReportInput["plan"]["cycles"] = [];
  const manualReview: ReportInput["manualReview"] = [];

  for (let index = 1; index <= (options.stepCount ?? 0); index += 1) {
    const file = path.join(basePath, "src", `file-${formatNumber(index)}.js`);
    graph.set(file, new Set());
    steps.push({ files: [file], isCycle: false });
  }

  for (let index = 1; index <= (options.cycleCount ?? 0); index += 1) {
    const first = path.join(basePath, "src", `cycle-${formatNumber(index)}-a.js`);
    const second = path.join(
      basePath,
      "src",
      `cycle-${formatNumber(index)}-b.js`,
    );
    graph.set(first, new Set([second]));
    graph.set(second, new Set([first]));
    cycles.push([first, second]);
  }

  for (
    let index = 1;
    index <= (options.typeScriptWarningCount ?? 0);
    index += 1
  ) {
    const file = path.join(
      basePath,
      "src",
      `ts-warning-${formatNumber(index)}.ts`,
    );
    const dependency = path.join(
      basePath,
      "src",
      `ts-warning-${formatNumber(index)}.js`,
    );
    graph.set(file, new Set([dependency]));
    graph.set(dependency, new Set());
  }

  for (let index = 1; index <= (options.manualReviewCount ?? 0); index += 1) {
    manualReview.push({
      file: path.join(basePath, "src", `manual-${formatNumber(index)}.js`),
      reason: "dynamic import",
      detail: "import(expr)",
    });
  }

  return {
    plan: { steps, cycles },
    graph,
    manualReview,
    basePath,
    ...(options.reportLimit !== undefined
      ? { reportLimit: options.reportLimit }
      : {}),
  };
}

function createReportLimitFixture(): string {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "ts-analyze-report-limit-"),
  );
  temporaryFixtures.push(fixtureRoot);
  const sourceRoot = path.join(fixtureRoot, "src");
  fs.mkdirSync(sourceRoot);

  for (let index = 1; index <= 12; index += 1) {
    fs.writeFileSync(
      path.join(sourceRoot, `file-${formatNumber(index)}.js`),
      `export const value${index} = ${index};\n`,
    );
  }

  return fixtureRoot;
}

function countOccurrences(value: string, search: string): number {
  return value.split(search).length - 1;
}

function formatNumber(value: number): string {
  return value.toString().padStart(2, "0");
}
