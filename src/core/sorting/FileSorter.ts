import type FileSorterInterface from '@/src/core/sorting/FileSorterInterface.js';
import type { FileResult } from '@/src/types/fileResult.js';

export default class FileSorter implements FileSorterInterface {
	sort(unsortedFiles: FileResult[]): FileResult[] {
		return unsortedFiles.sort((firstFile, secondFile) => {
			// return by their number of dependencies (ascending)
			if (firstFile.dependencies < secondFile.dependencies) return -1;
			if (firstFile.dependencies > secondFile.dependencies) return 1;

			// return by their number of dependents (descending)
			if (firstFile.dependents > secondFile.dependents) return -1;
			if (firstFile.dependents < secondFile.dependents) return 1;

			return firstFile.source.localeCompare(secondFile.source);
		});
	}
}
