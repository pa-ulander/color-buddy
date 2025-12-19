# Configuring Search Exclude Patterns

ColorBuddy's "Find Usages" feature searches your workspace for color occurrences. You can customize which directories to skip for better performance.

## Default Excluded Directories

By default, ColorBuddy excludes these common build/dependency folders:
- `**/node_modules/**` - npm packages
- `**/vendor/**` - Composer/PHP dependencies
- `**/dist/**` - Build output
- `**/out/**` - Compiled output
- `**/build/**` - Build directory
- `**/.git/**` - Git internals
- `**/coverage/**` - Test coverage
- `**/.vscode-test/**` - VS Code test files
- `**/storage/**` - Laravel storage
- `**/tmp/**` - Temp files
- `**/temp/**` - Temp files
- `**/cache/**` - Cache directories

## Customizing Exclude Patterns

### Via VS Code Settings UI

1. Open Settings (`Ctrl+,` or `Cmd+,`)
2. Search for "ColorBuddy Search Exclude"
3. Click "Add Item" to add custom patterns
4. Use glob patterns like `**/my-folder/**`

### Via settings.json

```jsonc
{
  "colorbuddy.searchExcludePatterns": [
    // Keep defaults
    "**/node_modules/**",
    "**/vendor/**",
    "**/dist/**",
    
    // Add your custom excludes
    "**/public/assets/**",    // Large asset directories
    "**/.next/**",            // Next.js build
    "**/.nuxt/**",            // Nuxt.js build
    "**/target/**",           // Rust/Java build
    "**/venv/**",             // Python virtual env
    "**/.svelte-kit/**"       // SvelteKit build
  ]
}
```

## Common Framework Patterns

### Laravel
```json
"colorbuddy.searchExcludePatterns": [
  "**/node_modules/**", "**/vendor/**",
  "**/storage/**", "**/bootstrap/cache/**"
]
```

### Next.js
```json
"colorbuddy.searchExcludePatterns": [
  "**/node_modules/**", "**/.next/**", "**/out/**"
]
```

### Rails
```json
"colorbuddy.searchExcludePatterns": [
  "**/node_modules/**", "**/vendor/**",
  "**/tmp/**", "**/log/**", "**/public/packs/**"
]
```

### .NET
```json
"colorbuddy.searchExcludePatterns": [
  "**/node_modules/**", "**/bin/**", "**/obj/**"
]
```

## Performance Tips

- **More excludes = faster search**: Add any large directories that don't contain colors
- **Use wildcards**: `**/build-*/**` excludes `build-dev`, `build-prod`, etc.
- **Check .gitignore**: If you're excluding from git, probably exclude from search too
