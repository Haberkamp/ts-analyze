# ts-analyze

Plan and guard a JavaScript → TypeScript migration.

- **Migration priority**: the JavaScript files to convert, in an order where every file comes after the files it imports.
- **Circular dependencies**: every import cycle, including cycles between TypeScript files and cycles that cross the JS/TS boundary.
- **Mixed branches**: a TypeScript file that imports a JavaScript file. Migration should go leaves-first, so this is reported as an error and the command exits with code 1.

## Usage

```sh
npx ts-analyze src/index.js
npx ts-analyze src                      # every source file below src/
npx ts-analyze --entry src/index.js --entry src/admin.js
npx ts-analyze --config tsconfig.app.json src
npx ts-analyze why src/greeting.ts      # which JavaScript a TypeScript file imports
```

```
Migration priority (3)

  1. src/legacy.js  [ready, fixes mixed branch]
  2. src/a.js, src/b.js  [cycle: migrate together, ready]
  3. src/index.js

Circular dependencies (1)

  1. ┌─▶ src/a.js
     │   ↓
     └── src/b.js

Mixed branches: TypeScript importing JavaScript (1)

  1. src/feature.ts
       imports src/legacy.js  [line 1]

Manual review (1)

  1. src/index.js:5  import(name)  [non-literal dynamic import]

✖ 1 TypeScript file imports JavaScript. Migrate the files marked "fixes mixed branch" first.
```

| Option | |
| --- | --- |
| `--entry <path>` | Entry point; repeatable. Positional entries work too. Files, extensionless paths, or directories (skips `node_modules` and hidden folders). |
| `-c, --config <file>` | `tsconfig.json` or `jsconfig.json`. Defaults to the nearest one above the working directory. `--tsconfig` is an alias. |
| `--format json` | Machine-readable output with the same content. |
| `--dry-run` | Report mixed branches without failing. |
| `--report-limit <n>` / `--no-report-limit` | Items per list in the human report (default 10). |

Exit codes: `0` no mixed branches (or `--dry-run`), `1` mixed branches found, `2` invalid usage or configuration.

### How the priority list is ordered

Files only appear after everything they import, directly or through TypeScript files. Among files that are free to go next, the list prefers:

1. files that must be migrated to fix a mixed branch,
2. files closer to the leaves,
3. files imported by more files,
4. path order.

Tags: `ready` means the file imports no JavaScript right now. `cycle: migrate together` groups files in an import cycle.

### What is understood

- `import`, `export … from`, `import()`, `require()`, `import x = require()`, `import type`, and `typeof import()`
- `.js .jsx .mjs .cjs` as JavaScript; `.ts .tsx .mts .cts` as TypeScript
- JavaScript hidden behind a `.d.ts` / `.d.mts` / `.d.cts` sidecar counts as JavaScript; declaration-only modules are ignored
- tsconfig `paths`, `baseUrl`, `extends`, solution-style `references`, `jsconfig.json`, and package.json `imports` with `import`/`require` conditions
- Imports that are rejected under strict NodeNext rules but that a bundler accepts (for example extensionless ESM)
- Packages in `node_modules`, including symlinked workspace packages, are external. JSON and assets are ignored.

Listed for manual review: non-literal `require()` / `import()`, and local imports or `paths` aliases that resolve to nothing.

## Development

```sh
npm install
npm test        # integration tests over fixtures/
npm run check   # typecheck src and tests
npm run build
```

The code follows a hexagonal layout:

```
src/domain/        pure analysis: cycles, mixed branches, priority order
src/application/   ports (entry points, scanner, resolver) and use cases
src/adapters/      TypeScript compiler API, file system, CLI and reports
src/composition-root.ts, src/index.ts
```

Tests drive the CLI against small projects in [`fixtures/`](fixtures). Each test copies its fixture to a temporary directory first.
