import type FileSorterInterface from '@/src/core/FileSorterInterface.ts';
import type { FileResult } from '../types/fileResult.ts';

export default class FileSorter implements FileSorterInterface {
	sort(unsortedFiles: FileResult[]): FileResult[] {
		return unsortedFiles.sort((firstFile, secondFile) => {
			// return by their number of dependencies (ascending)
			if (firstFile.dependencies < secondFile.dependencies) return -1;
			if (firstFile.dependencies > secondFile.dependencies) return 1;

			return 0;
		});
	}
}
