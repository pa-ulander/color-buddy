import * as vscode from 'vscode';
import type { AccessibilityUsageMatch } from '../../accessibilityViewProvider';
import { ColorFormatter } from '../../colorFormatter';
import type { ColorData } from '../../../types';
import type { FormatConversion } from '../../../utils/colorFormatConversions';

const MAX_COLOR_USAGE_RESULTS = 500;
const DEFAULT_SEARCH_EXCLUDE_PATTERNS = [
	'**/node_modules/**',
	'**/dist/**',
	'**/build/**',
	'**/.git/**',
	'**/out/**',
	'**/*.min.js',
	'**/*.bundle.js'
];

export interface ColorSearchContext {
	label: string;
	normalizedColor: string;
	vscodeColor: vscode.Color;
	format: string;
	colorData?: ColorData;
}

export interface SearchProgressCallback {
	(matches: AccessibilityUsageMatch[], isComplete: boolean): void;
}

/**
 * Service responsible for searching color usages across the workspace.
 * Shared by both UsagesPanelProvider and FormatsPanelProvider.
 */
export class UsageSearchService {
	constructor(
		private readonly colorFormatter: ColorFormatter
	) {}

	/**
	 * Search for all usages of a color in the workspace.
	 * Returns matches progressively via the callback for better UX.
	 */
	async searchColorUsages(
		context: ColorSearchContext,
		progressCallback?: SearchProgressCallback
	): Promise<AccessibilityUsageMatch[]> {
		const searchCandidates = this.getColorSearchCandidates(context);
		console.log(`[cb] searching for color in ${searchCandidates.length} format variations:`, searchCandidates);

		if (searchCandidates.length === 0) {
			return [];
		}

		// Build regex pattern to match ALL format variations in one pass
		const regexPattern = this.buildSearchRegex(searchCandidates);
		
		// Perform search with progressive updates
		const matches = await this.searchWithRegex(regexPattern, context.label, searchCandidates, progressCallback);
		
		return matches;
	}

	/**
	 * Get all format variations to search for.
	 */
	getColorSearchCandidates(context: ColorSearchContext): FormatConversion[] {
		const candidates: FormatConversion[] = [];
		const color = context.vscodeColor;

		// Core formats with canonical values
		const hexValue = this.colorFormatter.formatByFormat(color, 'hex');
		const rgbValue = this.colorFormatter.formatByFormat(color, 'rgb');
		const hslValue = this.colorFormatter.formatByFormat(color, 'hsl');

		if (hexValue) {
			candidates.push({ format: 'hex', value: hexValue });
		}
		if (rgbValue) {
			candidates.push({ format: 'rgb', value: rgbValue });
		}
		if (hslValue) {
			candidates.push({ format: 'hsl', value: hslValue });
		}

		// Add alpha variants if color has transparency
		if (color.alpha < 1) {
			const hexAlphaValue = this.colorFormatter.formatByFormat(color, 'hexAlpha');
			const rgbaValue = this.colorFormatter.formatByFormat(color, 'rgba');
			const hslaValue = this.colorFormatter.formatByFormat(color, 'hsla');

			if (hexAlphaValue) {
				candidates.push({ format: 'hexAlpha', value: hexAlphaValue });
			}
			if (rgbaValue) {
				candidates.push({ format: 'rgba', value: rgbaValue });
			}
			if (hslaValue) {
				candidates.push({ format: 'hsla', value: hslaValue });
			}
		}

		// Add Tailwind format
		const tailwindValue = this.colorFormatter.formatByFormat(color, 'tailwind');
		if (tailwindValue) {
			candidates.push({ format: 'tailwind', value: tailwindValue });
		}

		// Add CSS variable if present (use 'hex' as placeholder format)
		if (context.colorData?.isCssVariable && context.colorData.variableName) {
			candidates.push({
				format: 'hex' as FormatConversion['format'],
				value: `var(${context.colorData.variableName})`
			});
		}

		// Add Tailwind class if present (use 'tailwind' format)
		if (context.colorData?.isTailwindClass && context.colorData.tailwindClass) {
			candidates.push({
				format: 'tailwind' as FormatConversion['format'],
				value: context.colorData.tailwindClass
			});
		}

		// Add CSS class if present (use 'hex' as placeholder format)
		if (context.colorData?.isCssClass && context.colorData.cssClassName) {
			candidates.push({
				format: 'hex' as FormatConversion['format'],
				value: context.colorData.cssClassName
			});
		}

		return candidates;
	}

	/**
	 * Build a regex pattern that matches all format variations.
	 */
	private buildSearchRegex(searchCandidates: FormatConversion[]): string {
		const patterns: string[] = [];

		for (const candidate of searchCandidates) {
			const value = candidate.value;
			
			// Escape special regex characters
			const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			
			// Add spacing variations
			const withSpaces = escaped;
			const withoutSpaces = escaped.replace(/\\s+/g, '').replace(/\s+/g, '');
			
			// Add both variations if different
			if (withSpaces !== withoutSpaces) {
				patterns.push(withSpaces, withoutSpaces);
			} else {
				patterns.push(withSpaces);
			}
		}

		// Remove duplicates and join with OR
		const uniquePatterns = [...new Set(patterns)];
		return uniquePatterns.join('|');
	}

	/**
	 * Search for color usages using regex pattern.
	 */
	private async searchWithRegex(
		regexPattern: string,
		_colorLabel: string,
		_searchCandidates: FormatConversion[],
		progressCallback?: SearchProgressCallback
	): Promise<AccessibilityUsageMatch[]> {
		const startTime = Date.now();
		const matches: AccessibilityUsageMatch[] = [];
		const BATCH_UPDATE_SIZE = 5; // Update every 5 matches

		// Get user-configured exclude patterns
		const config = vscode.workspace.getConfiguration('colorbuddy');
		const excludePatterns: string[] = config.get('searchExcludePatterns', DEFAULT_SEARCH_EXCLUDE_PATTERNS);
		const excludeGlob = excludePatterns.join(',');

		// Build include pattern from all supported file extensions
		const fileExtensions = [
			'ts', 'tsx', 'js', 'jsx',           // JavaScript/TypeScript
			'css', 'scss', 'sass', 'less',      // Stylesheets
			'html', 'xml', 'svg',               // Markup
			'vue', 'svelte', 'astro',           // Frameworks
			'php', 'blade.php',                 // PHP/Laravel
			'py', 'rb', 'go', 'rs',            // Other languages
			'java', 'kt', 'swift', 'cs',       // More languages
			'cpp', 'c', 'm', 'dart', 'lua',    // Even more languages
			'sh', 'ps1', 'sql', 'graphql',     // Scripts/queries
			'json', 'jsonc', 'yaml', 'toml',   // Config files
			'md', 'mdx'                         // Documentation
		];
		const searchPattern = `**/*.{${fileExtensions.join(',')}}`;

		console.log(`[cb] searching with REGEX pattern in all supported file types...`);

		// Try native search first
		let nativeSearchCompleted = false;
		try {
			await vscode.workspace.findTextInFiles(
				{ pattern: regexPattern, isRegExp: true, isCaseSensitive: true },
				{
					include: searchPattern,
					exclude: excludeGlob,
					maxResults: MAX_COLOR_USAGE_RESULTS,
					useIgnoreFiles: true,
					useGlobalIgnoreFiles: true
				},
				(result: vscode.TextSearchResult) => {
					nativeSearchCompleted = true;
					if ('ranges' in result && 'preview' in result && result.preview && typeof result.preview === 'object' && 'text' in result.preview) {
						const ranges = result.ranges as vscode.Range | readonly vscode.Range[];
						const range = Array.isArray(ranges) ? ranges[0] : ranges;
						const preview = result.preview as { text: string };
						
						matches.push({
							uri: result.uri,
							range: range,
							previewText: preview.text.trim(),
							relativePath: vscode.workspace.asRelativePath(result.uri, false),
							isConvertible: true
						});

						// Progressive updates
						if (matches.length % BATCH_UPDATE_SIZE === 0 && progressCallback) {
							progressCallback(matches, false);
						}
					}
				}
			);

			if (matches.length > 0 || nativeSearchCompleted) {
				const elapsed = Date.now() - startTime;
				console.log(`[cb] found ${matches.length} matches in ${elapsed}ms using native search`);
				if (progressCallback) {
					progressCallback(matches, true);
				}
				return matches;
			}

			console.log(`[cb] native search returned no results, trying fallback`);
		} catch (nativeError) {
			console.log(`[cb] native search error, using fallback:`, nativeError);
		}

		// Fallback: Direct file search
		const files = await vscode.workspace.findFiles(searchPattern, `{${excludeGlob}}`);
		console.log(`[cb] scanning ${files.length} files (fallback mode)`);

		const regex = new RegExp(regexPattern, 'g');
		for (const fileUri of files) {
			try {
				const document = await vscode.workspace.openTextDocument(fileUri);
				const text = document.getText();

				regex.lastIndex = 0;
				let match;
				while ((match = regex.exec(text)) !== null) {
					const position = document.positionAt(match.index);
					const line = document.lineAt(position.line);

					matches.push({
						uri: fileUri,
						range: new vscode.Range(position, position.translate(0, match[0].length)),
						previewText: line.text.trim(),
						relativePath: vscode.workspace.asRelativePath(fileUri, false),
						isConvertible: true
					});

					if (matches.length >= MAX_COLOR_USAGE_RESULTS) {
						break;
					}
				}
			} catch (err) {
				// Skip unreadable files
			}

			if (matches.length >= MAX_COLOR_USAGE_RESULTS) {
				break;
			}
		}

		const elapsed = Date.now() - startTime;
		console.log(`[cb] found ${matches.length} matches in ${elapsed}ms using fallback`);
		
		if (progressCallback) {
			progressCallback(matches, true);
		}
		
		return matches;
	}
}
