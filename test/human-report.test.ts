import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { copyFixture, repoRoot, run } from "./support.js";

const fixtures = fs
  .readdirSync(path.join(repoRoot, "fixtures"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe("human report snapshots", () => {
  it.each(fixtures)("%s", (fixture) => {
    const result = run(copyFixture(fixture), ["--no-report-limit", "src"]);

    expect(`exit code ${result.exitCode}\n\n${result.stdout}`).toMatchSnapshot();
  });
});
