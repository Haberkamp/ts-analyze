import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadTsConfig } from "./src/config.js";
import { buildDependencyGraph } from "./src/graph.js";
import { determineMigrationOrder } from "./src/order.js";
import { formatMigrationReport } from "./src/report.js";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(repoRoot, "fixtures");

describe("fixtures", () => {
  for (const fixtureName of fixtureNames()) {
    it(`matches the migration report snapshot for ${fixtureName}`, () => {
      const fixtureRoot = path.join(fixturesRoot, fixtureName);
      const entryPoint = path.join(fixtureRoot, "src", "index");
      const configPath = path.relative(
        repoRoot,
        path.join(fixtureRoot, "tsconfig.json"),
      );

      const projectConfig = loadTsConfig(repoRoot, configPath);
      const graphResult = buildDependencyGraph(
        [entryPoint],
        projectConfig,
        repoRoot,
      );
      const plan = determineMigrationOrder(graphResult.graph);

      expect(
        formatMigrationReport({
          plan,
          manualReview: graphResult.manualReview,
          basePath: projectConfig.basePath,
        }),
      ).toMatchSnapshot();
    });
  }
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
