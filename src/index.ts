#!/usr/bin/env node

import { cruise, type IModule, type IReporterOutput } from 'dependency-cruiser';
import { program } from 'commander';
import extractWebpackResolveConfig from 'dependency-cruiser/config-utl/extract-webpack-resolve-config';
import extractTSConfig from 'dependency-cruiser/config-utl/extract-ts-config';

// create cli argument for webpack path
program.option('--webpack-config <path>', undefined);
program.option('--ts-config <path>', undefined);

program.parse(process.argv);

const options = program.opts();

// TODO: handle error
const webpackConfig = !!options.webpackConfig
	? // @ts-ignore
	  await extractWebpackResolveConfig(options.webpackConfig)
	: undefined;
const tsConfig = !!options.tsConfig
	? // @ts-ignore
	  extractTSConfig(options.tsConfig)
	: undefined;

const cruiseResult: IReporterOutput = await cruise(
	['src'],
	{
		includeOnly: '^src',
		ruleSet: {
			// @ts-ignore
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

type FileResult = {
	// path to the file
	source: string;
	// the amount of dependencies the files has
	dependencies: number;
	// the amount of files that are dependent on this file
	dependents: number;
};

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

const result = cruiseResult.output.modules
	.reduce<Array<FileResult>>((accumulator, moduleReport) => {
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
	}, [])
	.sort((a, b) => {
		// 1. sort by dependencies (ascending)
		// 2. sort by dependents (descending)
		// 3. sort by source (ascending)
		if (a.dependencies > b.dependencies) return 1;
		if (a.dependencies < b.dependencies) return -1;

		if (a.dependents > b.dependents) return -1;
		if (a.dependents < b.dependents) return 1;

		return a.source.localeCompare(b.source);
	});

console.table(result);
