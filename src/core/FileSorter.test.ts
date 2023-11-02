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

	it.todo('should sort files by their number of dependents (descending)');

	it.todo('should sort files by their file name in alphabetical order');
});
