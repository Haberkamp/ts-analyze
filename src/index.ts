#!/usr/bin/env node

import {
	cruise,
	type IModule,
	type IReporterOutput,
	type IResolveOptions,
} from 'dependency-cruiser';
import { Command } from '@commander-js/extra-typings';
import extractWebpackResolveConfig from 'dependency-cruiser/config-utl/extract-webpack-resolve-config';
import extractTSConfig from 'dependency-cruiser/config-utl/extract-ts-config';
import type { FileResult } from '@/src/types/fileResult.js';
import FileSorter from './core/sorting/FileSorter.js';
import DependencyCounter from './core/analysis/dependency/DependencyCounter.js';

const program = new Command()
	.argument('<directories...>', 'directories to analyze')
	.option('--webpack-config <path>', undefined)
	.option('--ts-config <path>', undefined);

program.parse(process.argv);

const options = program.opts();
const args = program.args;

// TODO: handle error
const webpackConfig = options.webpackConfig
	? // @ts-expect-error -- dependency-cruiser does not provide correct typings
	  ((await extractWebpackResolveConfig(
			options.webpackConfig,
	  )) as IResolveOptions)
	: undefined;

type TSConfig = unknown;

const tsConfig = options.tsConfig
	? // @ts-expect-error -- dependency-cruiser does not provide the correct typings
	  (extractTSConfig(options.tsConfig) as TSConfig)
	: undefined;

const modifiedDirectoryPaths = args.map((path) => {
	return path.replace(/^\.\//, '').replace(/\/$/, '');
});

const cruiseResult: IReporterOutput = await cruise(
	modifiedDirectoryPaths,
	{
		includeOnly: modifiedDirectoryPaths.map((path) => `^${path}`),
		ruleSet: {
			// @ts-expect-error -- code works as expected typings of dependency-cruiser are wrong
			options: {
				doNotFollow: { path: 'node_modules' },
				tsPreCompilationDeps: tsConfig ? true : undefined,
				tsConfig: options.tsConfig ? { fileName: options.tsConfig } : undefined,
			},
		},
	},
	webpackConfig,
	{ tsConfig },
);

if (typeof cruiseResult.output === 'string')
	throw new Error('Failed to analyze project; Output is a string.');

const migrationCompleted = cruiseResult.output.modules.every((module) =>
	module.source.includes('.ts'),
);
if (migrationCompleted) {
	console.log('Migration completed!');
	process.exit(0);
}

function countDependents(module: IModule): string[] {
	return module.dependents.reduce<string[]>((accumulator, dependent) => {
		if (typeof cruiseResult.output === 'string')
			throw new Error('Failed to analyze project; Output is a string.');

		const dependentsOfDependent = cruiseResult.output.modules.filter(
			(currentModule) => currentModule.source === dependent,
		);

		const result = dependentsOfDependent.reduce<string[]>(
			(accumulator, currentModule) => {
				const deps = countDependents(currentModule);

				return [...accumulator, ...deps];
			},
			[],
		);

		return [...accumulator, ...result, dependent];
	}, []);
}

const dependencyCounter = new DependencyCounter();

const result = cruiseResult.output.modules.reduce<Array<FileResult>>(
	(accumulator, moduleReport) => {
		const isTypeScriptFile = moduleReport.source.endsWith('.ts');
		if (isTypeScriptFile) return accumulator;

		if (typeof cruiseResult.output === 'string')
			throw new Error('Failed to analyze project; Output is a string.');

		const dependencyCount = dependencyCounter.countDependencies(
			moduleReport,
			cruiseResult.output.modules,
		);
		const dependents = countDependents(moduleReport);

		const dependentsCount = new Set(dependents).size;

		return [
			...accumulator,
			{
				source: moduleReport.source,
				dependencies: dependencyCount,
				dependents: dependentsCount,
			},
		];
	},
	[],
);

const fileSorter = new FileSorter();
const sortedResult = fileSorter.sort(result);

const totalFiles = cruiseResult.output.modules.length;
const amountOfTSFiles = cruiseResult.output.modules.filter((file) =>
	file.source.endsWith('.ts'),
).length;

const progress =
	amountOfTSFiles === 0 ? 0 : (amountOfTSFiles / totalFiles) * 100;

console.log('Summary');
console.log(
	`Progress: ${Math.floor(
		progress,
	)}% -- ${amountOfTSFiles} out of ${totalFiles} files converted`,
);

console.log(`Next ${sortedResult.length} files to convert:`);
console.table(sortedResult.splice(0, sortedResult.length));
