import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
const ansi = {
  bgYellow: "\u001b[43m",
  blue: "\u001b[34m",
  bold: "\u001b[1m",
  gray: "\u001b[90m",
  reset: "\u001b[0m",
  white: "\u001b[97m",
};

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
        stripAnsi(
          formatMigrationReport({
            plan,
            graph: graphResult.graph,
            manualReview: graphResult.manualReview,
            basePath: projectConfig.basePath,
          }),
        ),
      ).toMatchSnapshot();
    });
  }
});

describe("TypeScript files with JavaScript dependencies", () => {
  it("prints only the problematic TypeScript file name in the report", () => {
    const fixtureRoot = path.join(fixturesRoot, "typescript-middle-js-leaf");
    const { graphResult, plan, projectConfig } = analyzeFixture(fixtureRoot);

    expect(
      stripAnsi(
        formatMigrationReport({
          plan,
          graph: graphResult.graph,
          manualReview: graphResult.manualReview,
          basePath: projectConfig.basePath,
        }),
      ),
    ).toContain(
      [
        "   [Warning]: TypeScript Files With JavaScript Dependencies:",
        "",
        "",
        " 1. src/greeting.ts",
        "",
        "   [Info]: Run `ts-analyze why <file>` to explain why a listed TypeScript file is non-leaf.",
      ].join("\n"),
    );
    expect(
      stripAnsi(
        formatMigrationReport({
          plan,
          graph: graphResult.graph,
          manualReview: graphResult.manualReview,
          basePath: projectConfig.basePath,
        }),
      ),
    ).not.toContain("src/greeting.ts -> src/punctuation.js");
  });

  it("explains why a requested TypeScript file is listed", () => {
    const fixtureRoot = path.join(fixturesRoot, "typescript-middle-js-leaf");
    const { graphResult, projectConfig } = analyzeFixture(fixtureRoot);

    expect(
      stripAnsi(
        formatWhyReport({
          file: path.join(fixtureRoot, "src", "greeting.ts"),
          graph: graphResult.graph,
          basePath: projectConfig.basePath,
        }),
      ),
    ).toBe(
      [
        "",
        " Why src/greeting.ts is listed:",
        "",
        " 1. src/greeting.ts imports src/punctuation.js",
        " 2. src/punctuation.js is JavaScript, so src/greeting.ts is not a TypeScript leaf.",
        "",
      ].join("\n"),
    );
  });

  it("supports the why subcommand", () => {
    expect(
      stripAnsi(
        runCli(
          [
            "--config",
            "fixtures/typescript-middle-js-leaf/tsconfig.json",
            "why",
            "fixtures/typescript-middle-js-leaf/src/greeting.ts",
          ],
          repoRoot,
        ),
      ),
    ).toBe(
      [
        "",
        " Why src/greeting.ts is listed:",
        "",
        " 1. src/greeting.ts imports src/punctuation.js",
        " 2. src/punctuation.js is JavaScript, so src/greeting.ts is not a TypeScript leaf.",
        "",
      ].join("\n"),
    );
  });
});

describe("report styling", () => {
  it("indents report content by one column", () => {
    const report = stripAnsi(
      formatMigrationReport(
        makeReportInput({
          stepCount: 1,
          typeScriptWarningCount: 1,
        }),
      ),
    );

    expect(report.split("\n")[0]).toBe("");
    expect(report.split("\n")[1]).toBe(" Migration Order:");
    expect(report).toContain(" 1. src/file-01.js");
    expect(report).toContain(
      "   [Warning]: TypeScript Files With JavaScript Dependencies:",
    );
    expect(report).toContain(" 1. src/ts-warning-01.ts");
    expect(report).toContain(
      "   [Info]: Run `ts-analyze why <file>` to explain why a listed TypeScript file is non-leaf.",
    );
  });

  it("links migration report file paths without changing visible text", () => {
    const report = formatMigrationReport(
      makeReportInput({
        stepCount: 1,
        cycleCount: 1,
        cycleFileCount: 2,
        typeScriptWarningCount: 1,
        manualReviewCount: 1,
      }),
    );

    expect(report).toContain(
      `${ansi.gray}1.${ansi.reset} ${ansi.white}${hyperlink(
        "src/file-01.js",
        fileUrl("src/file-01.js"),
      )}${ansi.reset}`,
    );
    expect(report).toContain(
      `${ansi.gray}1.${ansi.reset} ${ansi.white}${hyperlink(
        "src/cycle-01-a.js",
        fileUrl("src/cycle-01-a.js"),
      )}${ansi.reset}`,
    );
    expect(report).toContain(
      `${ansi.gray}   -${ansi.reset} ${ansi.white}${hyperlink(
        "src/cycle-01-b.js",
        fileUrl("src/cycle-01-b.js"),
      )}${ansi.reset}`,
    );
    expect(report).toContain(
      `${ansi.gray}1.${ansi.reset} ${ansi.white}${hyperlink(
        "src/ts-warning-01.ts",
        fileUrl("src/ts-warning-01.ts"),
      )}${ansi.reset}`,
    );
    expect(report).toContain(
      `${ansi.gray}1.${ansi.reset} ${ansi.white}${hyperlink(
        "src/manual-01.js",
        fileUrl("src/manual-01.js"),
      )} - dynamic import: import(expr)${ansi.reset}`,
    );
    expect(stripAnsi(report)).toContain("1. src/file-01.js");
  });

  it("links why report file paths without changing visible text", () => {
    const basePath = path.join(repoRoot, "virtual");
    const file = path.join(basePath, "src", "ts-warning-01.ts");
    const dependency = path.join(basePath, "src", "ts-warning-01.js");
    const graph = new Map([[file, new Set([dependency])]]);

    const report = formatWhyReport({ file, graph, basePath });

    expect(report).toContain(
      `${ansi.gray}1.${ansi.reset} ${ansi.white}${hyperlink(
        "src/ts-warning-01.ts",
        pathToFileURL(file).href,
      )} imports ${hyperlink(
        "src/ts-warning-01.js",
        pathToFileURL(dependency).href,
      )}${ansi.reset}`,
    );
    expect(report).toContain(
      `${ansi.gray}2.${ansi.reset} ${ansi.white}${hyperlink(
        "src/ts-warning-01.js",
        pathToFileURL(dependency).href,
      )} is JavaScript, so ${hyperlink(
        "src/ts-warning-01.ts",
        pathToFileURL(file).href,
      )} is not a TypeScript leaf.${ansi.reset}`,
    );
    expect(stripAnsi(report)).toBe(
      [
        "",
        " Why src/ts-warning-01.ts is listed:",
        "",
        " 1. src/ts-warning-01.ts imports src/ts-warning-01.js",
        " 2. src/ts-warning-01.js is JavaScript, so src/ts-warning-01.ts is not a TypeScript leaf.",
        "",
      ].join("\n"),
    );
  });

  it("aligns list item content without zero-padding numbers", () => {
    const report = formatMigrationReport(makeReportInput({ stepCount: 10 }));
    const lines = report.split("\n");

    expect(lines).toContain(
      ` ${ansi.gray} 1.${ansi.reset} ${ansi.white}${hyperlink(
        "src/file-01.js",
        fileUrl("src/file-01.js"),
      )}${ansi.reset}`,
    );
    expect(lines).toContain(
      ` ${ansi.gray} 2.${ansi.reset} ${ansi.white}${hyperlink(
        "src/file-02.js",
        fileUrl("src/file-02.js"),
      )}${ansi.reset}`,
    );
    expect(lines).toContain(
      ` ${ansi.gray}10.${ansi.reset} ${ansi.white}${hyperlink(
        "src/file-10.js",
        fileUrl("src/file-10.js"),
      )}${ansi.reset}`,
    );
    expect(report).not.toContain(`${ansi.gray}01.${ansi.reset}`);
  });

  it("renders circular dependency chains as nested list items", () => {
    const report = stripAnsi(
      formatMigrationReport(makeReportInput({ cycleCount: 1, cycleFileCount: 3 })),
    );

    expect(report).toContain(
      [
        "Circular Dependencies:",
        "",
        " 1. src/cycle-01-a.js",
        "    - src/cycle-01-b.js",
        "    - src/cycle-01-c.js",
      ].join("\n"),
    );
    expect(report).not.toContain(
      "src/cycle-01-a.js, src/cycle-01-b.js, src/cycle-01-c.js",
    );
  });

  it("color-codes sections, separates headers, and renders guidance as banners", () => {
    const report = formatMigrationReport(
      makeReportInput({
        stepCount: 3,
        cycleCount: 1,
        reportLimit: 2,
      }),
    );

    expect(report).toBe(
      [
        "",
        ` ${ansi.bold}Migration Order:${ansi.reset}`,
        "",
        ` ${ansi.gray}1.${ansi.reset} ${ansi.white}${hyperlink(
          "src/file-01.js",
          fileUrl("src/file-01.js"),
        )}${ansi.reset}`,
        ` ${ansi.gray}2.${ansi.reset} ${ansi.white}${hyperlink(
          "src/file-02.js",
          fileUrl("src/file-02.js"),
        )}${ansi.reset}`,
        `${ansi.gray}${ansi.reset}`,
        ` ${ansi.gray}  ${ansi.bold}[Info]:${ansi.reset}${ansi.gray} Showing 2 of 3 reports. Configure with \`--report-limit <number>\` or disable with \`--no-report-limit\`.  ${ansi.reset}`,
        "",
        "",
        ` ${ansi.bold}Circular Dependencies:${ansi.reset}`,
        "",
        ` ${ansi.gray}1.${ansi.reset} ${ansi.white}${hyperlink(
          "src/cycle-01-a.js",
          fileUrl("src/cycle-01-a.js"),
        )}${ansi.reset}`,
        ` ${ansi.gray}   -${ansi.reset} ${ansi.white}${hyperlink(
          "src/cycle-01-b.js",
          fileUrl("src/cycle-01-b.js"),
        )}${ansi.reset}`,
      ].join("\n"),
    );
  });

  it("renders warning headings with yellow background and blue text", () => {
    const report = formatMigrationReport(
      makeReportInput({ typeScriptWarningCount: 1 }),
    );
    const lines = report.split("\n");
    const headingText =
      "  [Warning]: TypeScript Files With JavaScript Dependencies:  ";
    const padding = " ".repeat(headingText.length);
    const headingIndex = lines.indexOf(
      ` ${ansi.bgYellow}${ansi.blue}${ansi.bold}${headingText}${ansi.reset}`,
    );

    expect(headingIndex).toBeGreaterThan(0);
    expect(lines[headingIndex - 1]).toBe(` ${ansi.bgYellow}${padding}${ansi.reset}`);
    expect(lines[headingIndex + 1]).toBe(` ${ansi.bgYellow}${padding}${ansi.reset}`);
    expect(lines[headingIndex + 2]).toBe("");
  });
});

describe("report limits", () => {
  it("limits each report section to 10 by default and prints guidance for truncated sections", () => {
    const report = stripAnsi(
      formatMigrationReport(
        makeReportInput({
          stepCount: 11,
          cycleCount: 11,
          typeScriptWarningCount: 11,
          manualReviewCount: 11,
        }),
      ),
    );

    expect(report).toContain("10. src/file-10.js");
    expect(report).not.toContain("src/file-11.js");
    expect(report).toContain(
      [" 10. src/cycle-10-a.js", "     - src/cycle-10-b.js"].join("\n"),
    );
    expect(report).not.toContain("src/cycle-11-a.js");
    expect(report).toContain("10. src/ts-warning-10.ts");
    expect(report).not.toContain("src/ts-warning-11.ts");
    expect(report).toContain("10. src/manual-10.js - dynamic import: import(expr)");
    expect(report).not.toContain("src/manual-11.js");
    expect(
      countOccurrences(
        report,
        "[Info]: Showing 10 of 11 reports. Configure with `--report-limit <number>` or disable with `--no-report-limit`.",
      ),
    ).toBe(4);
  });

  it("does not print limit guidance when a section does not exceed the limit", () => {
    const report = stripAnsi(
      formatMigrationReport(makeReportInput({ stepCount: 10 })),
    );

    expect(report).toContain("10. src/file-10.js");
    expect(report).not.toContain("Configure with `--report-limit <number>`");
  });

  it("uses a configured numeric report limit", () => {
    const report = stripAnsi(
      formatMigrationReport(makeReportInput({ stepCount: 3, reportLimit: 2 })),
    );

    expect(report).toContain("1. src/file-01.js");
    expect(report).toContain("2. src/file-02.js");
    expect(report).not.toContain("src/file-03.js");
    expect(report).toContain(
      "[Info]: Showing 2 of 3 reports. Configure with `--report-limit <number>` or disable with `--no-report-limit`.",
    );
  });

  it("can disable report limits", () => {
    const report = stripAnsi(
      formatMigrationReport(
        makeReportInput({ stepCount: 11, reportLimit: false }),
      ),
    );

    expect(report).toContain("11. src/file-11.js");
    expect(report).not.toContain("Configure with `--report-limit <number>`");
  });

  it("supports configuring the report limit from the CLI", () => {
    const fixtureRoot = createReportLimitFixture();

    expect(stripAnsi(runCli(["--report-limit", "2", "src"], fixtureRoot))).toBe(
      [
        "",
        " Migration Order:",
        "",
        " 1. src/file-01.js",
        " 2. src/file-02.js",
        "",
        "   [Info]: Showing 2 of 12 reports. Configure with `--report-limit <number>` or disable with `--no-report-limit`.",
        "",
      ].join("\n"),
    );
  });

  it("supports disabling the report limit from the CLI", () => {
    const fixtureRoot = createReportLimitFixture();

    const report = stripAnsi(runCli(["--no-report-limit", "src"], fixtureRoot));

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
  readonly cycleFileCount?: number;
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
    const files = Array.from(
      { length: options.cycleFileCount ?? 2 },
      (_, fileIndex) =>
        path.join(
          basePath,
          "src",
          `cycle-${formatNumber(index)}-${String.fromCharCode(97 + fileIndex)}.js`,
        ),
    );

    files.forEach((file, fileIndex) => {
      graph.set(file, new Set([files[(fileIndex + 1) % files.length]]));
    });
    cycles.push(files);
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

function stripAnsi(value: string): string {
  return value
    .replace(/\u001b]8;;[^\u0007]*\u0007/g, "")
    .replace(/\u001b]8;;\u0007/g, "")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : line.trimEnd()))
    .join("\n");
}

function formatNumber(value: number): string {
  return value.toString().padStart(2, "0");
}

function hyperlink(text: string, url: string): string {
  return `\u001b]8;;${url}\u0007${text}\u001b]8;;\u0007`;
}

function fileUrl(relativeFilePath: string): string {
  return pathToFileURL(path.join(repoRoot, "virtual", relativeFilePath)).href;
}
