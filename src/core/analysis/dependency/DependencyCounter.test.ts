import { describe, it, expect } from 'vitest';
import DependencyCounter from './DependencyCounter.js';
import { type IModule } from 'dependency-cruiser';

describe('src/core/analysis/dependency/DependencyCounter.ts', () => {
	it('should return a count of 0 dependencies when there are none', () => {
		// ARRANGE
		const counter = new DependencyCounter();

		const allModules: IModule[] = [
			{
				source: 'a.js',
				valid: true,
				dependencies: [],
				dependents: [],
			},
		];

		const module = allModules.at(0);
		if (!module) throw new Error('Failed to locate module');

		// ACT
		const result = counter.countDependencies(module, allModules);

		// ASSERT
		expect(result).toBe(0);
	});

	it('should return 1 dependency when file has one', () => {
		// ARRANGE
		const counter = new DependencyCounter();

		const allModules: IModule[] = [
			{
				source: 'a.js',
				valid: true,
				dependencies: [
					{
						circular: false,
						coreModule: false,
						couldNotResolve: false,
						dependencyTypes: [],
						dynamic: false,
						exoticallyRequired: false,
						followable: false,
						module: './b.js',
						resolved: 'b.js',
						protocol: 'file:',
						mimeType: 'application/javascript',
						moduleSystem: 'es6',
						valid: true,
						instability: 0,
					},
				],
				dependents: [],
			},
		];

		const module = allModules.at(0);
		if (!module) throw new Error('Failed to locate module');

		// ACT
		const result = counter.countDependencies(module, allModules);

		// ASSERT
		expect(result).toBe(1);
	});

	it('should return 2 dependency when the dependency has a dependency', () => {
		// ARRANGE
		const counter = new DependencyCounter();

		const allModules: IModule[] = [
			{
				source: 'a.js',
				valid: true,
				dependencies: [
					{
						circular: false,
						coreModule: false,
						couldNotResolve: false,
						dependencyTypes: [],
						dynamic: false,
						exoticallyRequired: false,
						followable: false,
						module: './b.js',
						resolved: 'b.js',
						protocol: 'file:',
						mimeType: 'application/javascript',
						moduleSystem: 'es6',
						valid: true,
						instability: 0,
					},
				],
				dependents: [],
			},
			{
				source: 'b.js',
				valid: true,
				dependencies: [
					{
						circular: false,
						coreModule: false,
						couldNotResolve: false,
						dependencyTypes: [],
						dynamic: false,
						exoticallyRequired: false,
						followable: false,
						module: './c.js',
						resolved: 'c.js',
						protocol: 'file:',
						mimeType: 'application/javascript',
						moduleSystem: 'es6',
						valid: true,
						instability: 0,
					},
				],
				dependents: [],
			},
			// TODO: if the object below is commented out the test still passes. Not intended.
			{
				source: 'c.js',
				valid: true,
				dependencies: [],
				dependents: [],
			},
		];

		const module = allModules.at(0);
		if (!module) throw new Error('Failed to locate module');

		// ACT
		const result = counter.countDependencies(module, allModules);

		// ASSERT
		expect(result).toBe(2);
	});

	it('should count dependency only once if it occurs multiple times in the dependency tree', () => {
		// ARRANGE
		const allModules: IModule[] = [
			{
				source: 'a.js',
				valid: true,
				dependencies: [
					{
						circular: false,
						coreModule: false,
						couldNotResolve: false,
						dependencyTypes: [],
						dynamic: false,
						exoticallyRequired: false,
						followable: false,
						module: './b.js',
						resolved: 'b.js',
						protocol: 'file:',
						mimeType: 'application/javascript',
						moduleSystem: 'es6',
						valid: true,
						instability: 0,
					},
					{
						circular: false,
						coreModule: false,
						couldNotResolve: false,
						dependencyTypes: [],
						dynamic: false,
						exoticallyRequired: false,
						followable: false,
						module: './c.js',
						resolved: 'c.js',
						protocol: 'file:',
						mimeType: 'application/javascript',
						moduleSystem: 'es6',
						valid: true,
						instability: 0,
					},
				],
				dependents: [],
			},
			{
				source: 'b.js',
				valid: true,
				dependencies: [
					{
						circular: false,
						coreModule: false,
						couldNotResolve: false,
						dependencyTypes: [],
						dynamic: false,
						exoticallyRequired: false,
						followable: false,
						module: './c.js',
						resolved: 'c.js',
						protocol: 'file:',
						mimeType: 'application/javascript',
						moduleSystem: 'es6',
						valid: true,
						instability: 0,
					},
				],
				dependents: [],
			},
			{
				source: 'c.js',
				valid: true,
				dependencies: [],
				dependents: ['a.js', 'b.js'],
			},
		];

		const module = allModules.at(0);
		if (!module) throw new Error('Failed to locate module');

		const counter = new DependencyCounter();

		// ACT
		const result = counter.countDependencies(module, allModules);

		// ASSERT
		expect(result).toBe(2);
	});
});
