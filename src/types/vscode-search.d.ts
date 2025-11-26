import type * as vscode from 'vscode';

declare module 'vscode' {
	export interface TextSearchQuery {
		pattern: string;
		isCaseSensitive?: boolean;
		isRegExp?: boolean;
		isWordMatch?: boolean;
		isMultiline?: boolean;
	}

	export interface TextSearchMatchPreview {
		readonly text: string;
		readonly matches: readonly vscode.Range[];
	}

	export interface TextSearchResult {
		readonly uri: vscode.Uri;
	}

	export interface TextSearchMatch extends TextSearchResult {
		readonly ranges: vscode.Range | readonly vscode.Range[];
		readonly preview: TextSearchMatchPreview;
	}

	export interface FindTextInFilesOptions {
		include?: vscode.GlobPattern;
		exclude?: vscode.GlobPattern;
		folder?: vscode.Uri;
		useIgnoreFiles?: boolean;
		useGlobalIgnoreFiles?: boolean;
		followSymlinks?: boolean;
		maxResults?: number;
	}

	export namespace workspace {
		function findTextInFiles(
			query: TextSearchQuery,
			callback: (result: TextSearchResult) => void
		): Thenable<void>;

		function findTextInFiles(
			query: TextSearchQuery,
			options: FindTextInFilesOptions,
			callback: (result: TextSearchResult) => void
		): Thenable<void>;
	}
}
