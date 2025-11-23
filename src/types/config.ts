/**
 * Extension configuration types.
 */

/**
 * Default list of languages supported by ColorBuddy.
 */
export const DEFAULT_LANGUAGES: string[] = [
    'css',
    'scss',
    'sass',
    'less',
    'stylus',
    'postcss',
    'html',
    'xml',
    'svg',
    'javascript',
    'javascriptreact',
    'typescript',
    'typescriptreact',
    'vue',
    'svelte',
    'astro',
    'json',
    'jsonc',
    'yaml',
    'toml',
    'markdown',
    'mdx',
    'plaintext',
    'python',
    'ruby',
    'php',
    'perl',
    'go',
    'rust',
    'java',
    'kotlin',
    'swift',
    'csharp',
    'cpp',
    'c',
    'objective-c',
    'dart',
    'lua',
    'shellscript',
    'powershell',
    'sql',
    'graphql'
];

/**
 * Configuration namespace for ColorBuddy extension.
 */
export const CONFIG_NAMESPACE = 'colorbuddy';

/**
 * Configuration keys used by the extension.
 */
export const ConfigKeys = {
    LANGUAGES: 'languages'
} as const;
