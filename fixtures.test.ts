import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadTsConfig } from "./src/config.js";
import { buildDependencyGraph } from "./src/graph.js";
import { runCli } from "./src/index.js";
import { determineMigrationOrder } from "./src/order.js";
import {
  formatMigrationReport,
  formatWhyReport,
} from "./src/report.js";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(repoRoot, "fixtures");

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
