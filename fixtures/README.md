# Fixtures

Each directory is a small project that one or more tests in [`test/`](../test) analyze. The tests copy a fixture to a temporary directory before running, so the repository's own `tsconfig.json` never applies.

To run one by hand after `npm run build`:

```sh
cd fixtures/report-showcase && node ../../dist/index.js src
```

`fixtures/**/node_modules` is committed on purpose; `external-packages` also contains a symlinked workspace package.
