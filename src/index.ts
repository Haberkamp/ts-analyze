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
import type { FileResult } from '@/src/types/fileResult.ts';
import FileSorter from './core/FileSorter.js';

const program = new Command()
	.option('--webpack-config <path>', undefined)
	.option('--ts-config <path>', undefined);

program.parse(process.argv);

const options = program.opts();

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

const cruiseResult: IReporterOutput = await cruise(
	['src'],
	{
		includeOnly: '^src',
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

if (typeof cruiseResult.output === 'string') throw new Error('lul');

const migrationCompleted = cruiseResult.output.modules.every((module) =>
	module.source.includes('.ts'),
);
if (migrationCompleted) {
	console.log('Migration completed!');
	process.exit(0);
}

function countDependencies(module: IModule): string[] {
	return module.dependencies.reduce<string[]>((accumulator, dependency) => {
		if (typeof cruiseResult.output === 'string') throw new Error('lul');
		const dependenciesOfDependency = cruiseResult.output.modules.filter(
			(currentModule) => currentModule.source === dependency.resolved,
		);

		const result = dependenciesOfDependency.reduce<string[]>(
			(accumulator, currentModule) => {
				const deps = countDependencies(currentModule);

				return [...accumulator, ...deps];
			},
			[],
		);

		return [...accumulator, dependency.resolved, ...result];
	}, []);
}

function countDependents(module: IModule): string[] {
	return module.dependents.reduce<string[]>((accumulator, dependent) => {
		if (typeof cruiseResult.output === 'string') throw new Error('lul');
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

const result = cruiseResult.output.modules.reduce<Array<FileResult>>(
	(accumulator, moduleReport) => {
		const isTypeScriptFile = moduleReport.source.endsWith('.ts');
		if (isTypeScriptFile) return accumulator;

		const deps = countDependencies(moduleReport);
		const dependents = countDependents(moduleReport);

		const depsCount = new Set(deps).size;
		const dependentsCount = new Set(dependents).size;

		return [
			...accumulator,
			{
				source: moduleReport.source,
				dependencies: depsCount,
				dependents: dependentsCount,
			},
		];
	},
	[],
);

const fileSorter = new FileSorter();
const sortedResult = fileSorter.sort(result);

console.table(sortedResult);
