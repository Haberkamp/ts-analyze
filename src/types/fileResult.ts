export type FileResult = {
	// path to the file
	source: string;
	// the amount of dependencies the files has
	dependencies: number;
	// the amount of files that are dependent on this file
	dependents: number;
};
