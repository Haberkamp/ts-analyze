# ts-analyze

A CLI tool to help migrating a JavaScript project over to TypeScript

> NOTE: This project is in it's early stages. The API is subject to
> subject to change and may happen without notice.

## Usage

```shell
npx ts-analyze ./src
```

## Motivation

Migrating a JavaScript codebase to TypeScript without any strategy will very likely
lead to a disaster. `ts-analyze` is specifically built to show you the correct order of files to migrate. Eliminating the problem of converting one file, realizing functions of other files have no types because they're written in JS, migrating those other files and then coming back and migrating the original file.

There's a popular tool out they're called `ts-migrate`. It converts you JavaScript
files over to Typescript but it will add lots of `@ts-expect-error`'s and `any` types
all over your codebase. They even state that fact themselves in their README.md file. You still have to add lots of type manually to improve type-safety. _The problem of
migrating files in the wrong order still persists._

## Contributing

Pull requests are welcome. For major changes, please open an issue first
to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

[MIT](./LICENSE.md)
