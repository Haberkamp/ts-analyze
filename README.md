# ts-analyze

Analyze migration order for JavaScript and TypeScript projects.

## Usage

Run without installing:

```sh
npx ts-analyze src/index.js
```

Pass a TypeScript config when needed:

```sh
npx ts-analyze --config tsconfig.json --entry src/index.js --entry src/admin.js
```

Explain why a TypeScript file is listed as non-leaf:

```sh
npx ts-analyze why src/greeting.ts
```

## Local Development

```sh
npm install
npm run build
npm test
```
