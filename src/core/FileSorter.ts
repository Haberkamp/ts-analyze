import type FileSorterInterface from '@/src/core/FileSorterInterface.ts';
import type { FileResult } from '../types/fileResult.ts';

export default class FileSorter implements FileSorterInterface {
	sort(unsortedFiles: FileResult[]) {
		throw new Error('method sort() not implemented.');
	}
}
