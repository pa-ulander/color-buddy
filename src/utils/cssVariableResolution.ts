import { CSS_VAR_PATTERN, MAX_CSS_VAR_RESOLUTION_DEPTH } from './constants';

export type CssVariableLookup = (name: string) => string | undefined;

/**
 * Expand var(--x) references in a value, recursively.
 *
 * Single pass over each value (no re-scanning of substituted text), so it always
 * terminates: references that are unknown, circular (already on the current
 * resolution path) or nested deeper than MAX_CSS_VAR_RESOLUTION_DEPTH are left as-is.
 * Results are memoized per call to keep shared sub-chains linear.
 */
export function resolveCssVariableReferences(
	value: string,
	lookup: CssVariableLookup,
	visited: ReadonlySet<string> = new Set()
): string {
	const path = new Set(visited);
	const memo = new Map<string, string>();

	const expand = (input: string, depth: number): string => {
		const pattern = new RegExp(CSS_VAR_PATTERN.source, 'g');
		return input.replace(pattern, (reference: string, name: string) => {
			if (path.has(name) || depth >= MAX_CSS_VAR_RESOLUTION_DEPTH) {
				return reference;
			}
			const memoized = memo.get(name);
			if (memoized !== undefined) {
				return memoized;
			}
			const raw = lookup(name);
			if (!raw) {
				return reference;
			}
			path.add(name);
			const resolved = expand(raw, depth + 1);
			path.delete(name);
			memo.set(name, resolved);
			return resolved;
		});
	};

	return expand(value, 0);
}
