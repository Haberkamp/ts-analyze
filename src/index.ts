#!/usr/bin/env node

import { runCli } from "./adapters/cli/run-cli.js";

try {
  const result = runCli(process.argv.slice(2), {
    cwd: process.cwd(),
    color: Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined,
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
} catch (error) {
  console.error(error);
  process.exitCode = 2;
}
