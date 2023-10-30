export function prependSlash(url) {
	return url.charAt(0) === '/' ? url : `/${url}`;
}
