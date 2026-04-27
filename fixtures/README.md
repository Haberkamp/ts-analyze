# Fixtures

These fixtures are small projects for manually testing the analyzer.

Run from the repository root after `npm run build`.

## Basic ESM

```sh
node ./dist/index.js --config fixtures/basic-esm/tsconfig.json fixtures/basic-esm/src/index.js
```

Expected shape: leaf utilities first, shared modules next, entry point last.

## CommonJS

```sh
node ./dist/index.js --config fixtures/commonjs/tsconfig.json fixtures/commonjs/src/index.js
```

Expected shape: `require("...")` dependencies before the CommonJS entry point.

## Re-Exports

```sh
node ./dist/index.js --config fixtures/re-exports/tsconfig.json fixtures/re-exports/src/index.js
```

Expected shape: re-exported files before barrels and consumers.

## Cycle

```sh
node ./dist/index.js --config fixtures/cycle/tsconfig.json fixtures/cycle/src/index.js
```

Expected shape: `a.js` and `b.js` reported as a cycle group.

## Dynamic Imports

```sh
node ./dist/index.js --config fixtures/dynamic/tsconfig.json fixtures/dynamic/src/index.js
```

Expected shape: literal dynamic imports resolved, non-literal dynamic imports flagged for manual review.

## TypeScript Only

```sh
node ./dist/index.js --config fixtures/typescript-only/tsconfig.json fixtures/typescript-only/src/index.ts
```

Expected shape: every reachable file is `.ts`, with shared type-only dependencies before runtime modules and entry point last.

## TypeScript Leaves

```sh
node ./dist/index.js --config fixtures/typescript-leaves/tsconfig.json fixtures/typescript-leaves/src/index.js
```

Expected shape: JS entry and middle files depend on `.ts` leaf utility files, so the TypeScript leaves appear first.

## TypeScript Middle With JS Leaf

```sh
node ./dist/index.js --config fixtures/typescript-middle-js-leaf/tsconfig.json fixtures/typescript-middle-js-leaf/src/index.js
```

Expected shape: a `.js` leaf appears before the non-leaf `.ts` module, followed by the JS entry point.

## Path Aliases

```sh
node ./dist/index.js --config fixtures/path-alias/tsconfig.json fixtures/path-alias/src/index.js
```

Expected shape: `@utils/math` resolves through `tsconfig.json` paths.

## Unresolved Imports

```sh
node ./dist/index.js --config fixtures/unresolved/tsconfig.json fixtures/unresolved/src/index.js
```

Expected shape: external packages and missing local modules are ignored by the migration order.
