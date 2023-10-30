import { prependSlash } from '@utilities/string.js';

export async function get(url) {
	const URL = prependSlash(url);

	return fetch(URL)
		.then((res) => {
			if (res.ok) return res;

			throw new Error(res.statusText);
		})
		.then((res) => res.json());
}
