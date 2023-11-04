import type { FileResult } from '@/src/types/fileResult.ts';

export default interface FileSorterInterface {
	sort(unsortedFiles: FileResult[]): FileResult[];
}
