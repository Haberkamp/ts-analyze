import { describe, it, expect } from 'vitest';
import FileSorter from './FileSorter.js';
import type { FileResult } from '../types/fileResult.js';

describe('src/core/FileSorter.ts', () => {
	it('should sort files by their number of dependencies (ascending)', () => {
		// ARRANGE
		const files: FileResult[] = [
			{
				source: 'b.js',
				dependencies: 1,
				dependents: 0,
			},
			{
				source: 'a.js',
				dependencies: 0,
				dependents: 0,
			},
		];

		const sorter = new FileSorter();

		// ACT
		const result = sorter.sort(files);

		// ASSERT
		expect(result).toStrictEqual([
			{
				source: 'a.js',
				dependencies: 0,
				dependents: 0,
			},
			{
				source: 'b.js',
				dependencies: 1,
				dependents: 0,
			},
		]);
	});

	it('should sort files by their number of dependents (descending)', () => {
		// ARRANGE
		const files: FileResult[] = [
			{
				source: 'a.js',
				dependencies: 0,
				dependents: 1,
			},
			{
				source: 'b.js',
				dependencies: 0,
				dependents: 2,
			},
		];

		const sorter = new FileSorter();

		// ACT
		const result = sorter.sort(files);

		// ASSERT
		expect(result).toStrictEqual([
			{
				source: 'b.js',
				dependencies: 0,
				dependents: 2,
			},
			{
				source: 'a.js',
				dependencies: 0,
				dependents: 1,
			},
		]);
	});

	it('should sort files by their file name in alphabetical order', () => {
		// ARRANGE
		const files: FileResult[] = [
			{
				source: 'b.js',
				dependencies: 0,
				dependents: 0,
			},
			{
				source: 'a.js',
				dependencies: 0,
				dependents: 0,
			},
		];

		const sorter = new FileSorter();

		// ACT
		const result = sorter.sort(files);

		// ASSERT
		expect(result).toStrictEqual([
			{
				source: 'a.js',
				dependencies: 0,
				dependents: 0,
			},
			{
				source: 'b.js',
				dependencies: 0,
				dependents: 0,
			},
		]);
	});
});
