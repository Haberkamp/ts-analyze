/* eslint-env node */
module.exports = {
	root: true,
	plugins: ['@typescript-eslint'],
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/strict-type-checked',
	],
	parser: '@typescript-eslint/parser',
	parserOptions: {
		project: true,
		tsconfigRootDir: __dirname,
	},
};
