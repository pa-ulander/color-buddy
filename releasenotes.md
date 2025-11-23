# ColorBuddy Release Notes

---

## Version 0.0.3 - November 23, 2025

### Major Refactoring & Sass Parity

This release is focused on refactoring, performance optimization and general code improvements and not so much on adding new features.  
Tightened Sass support so color tooling feels consistent across your stylesheets.

### What Changed

**Inline Swatches Return**
- Reinstated inline decorations for CSS variables and class colors in CSS, SCSS, and Sass files using the new decoration styling
- Removed stray swatches that previously appeared between the `--` prefix and variable names
- Ensured Tailwind class lookups inside variable names no longer create duplicate decorations

**Sass Color Picker Parity**
- Sass HSL/HSLA literals now light up with both inline swatches and the native VS Code color picker
- RGB/RGBA literals continue to rely on VS Code's built-in provider, preventing duplicate pickers while preserving tooling coverage

**Quality Guardrails**
- Added targeted integration tests covering CSS decorations and Sass color provider output
- Included an example Sass file to verify compact HSL workflows end-to-end

### Why This Matters

Design systems often mix CSS variables, Tailwind tokens, and nested Sass syntax. Version 0.0.3 keeps the editor view tidy, restores the visual context around variables, and guarantees Sass authors get the same editing experience as their CSS/SCSS counterparts.

### Upgrading

Just update via the VS Code marketplace. Decorations refresh automatically; there are no configuration changes required.

---

## Version 0.0.2 - November 20, 2025

### Rebranding & Polish Release

This release focuses on establishing ColorBuddy's identity and improving the visual presentation of the extension.

### What Changed

**Complete Rebranding**
- Renamed from "YAVCOP" to **ColorBuddy – Your VS Code Color Companion**
- Updated all command names from `yavcop.*` to `colorbuddy.*`:
  - `colorbuddy.reindexCSSFiles` - Re-index CSS Variables
  - `colorbuddy.showColorPalette` - Show Workspace Color Palette
- Updated internal logging and references throughout the codebase
- Improved extension metadata and marketplace presence

**Visual Assets & Documentation**
- Added professional extension icon for VS Code marketplace
- Added banner image for enhanced marketplace listing
- Added screenshot and color preview images for better feature showcase
- Updated README with relative image paths for improved portability
- Enhanced documentation structure

**Housekeeping**
- Removed unused files from development
- Updated `.gitignore` configuration to properly track image assets
- Cleaned up project structure

### Why This Matters

This release establishes ColorBuddy's brand identity and improves discoverability in the VS Code marketplace. The new visual assets and clearer naming make it easier for users to understand what the extension does at a glance.

### Upgrading

No action required. The extension will automatically update, and all functionality remains the same. Note that command names have changed from `yavcop.*` to `colorbuddy.*`, so if you have any keyboard shortcuts or custom scripts using the old command names, you'll need to update them.

---

## Version 0.0.1 - November 20, 2025

### Initial Release

**Release Date:** November 20, 2025

We're excited to announce the initial release of **ColorBuddy – Your VS Code Color Companion**! This extension enhances your coding experience by providing intelligent color detection, visualization, and management across your workspace.

## What's New

### Core Features

**Color Detection & Visualization**
- Inline color indicators appear next to recognized color values in your code
- Interactive hover previews with color swatches using SVG data URIs
- Native VS Code color picker integration for quick color editing
- Format preservation - edits maintain your original color notation

**Supported Color Formats**
- **Hex**: `#f00`, `#ff0000`, `#ff0000cc`
- **RGB/RGBA**: `rgb(255, 0, 0)`, `rgba(255, 0, 0, 0.5)`
- **HSL/HSLA**: `hsl(0 100% 50%)`, `hsla(0 100% 50% / 0.5)`
- **Tailwind Compact HSL**: `0 100% 50%`, `0 100% 50% / 0.5`

### CSS Variable Intelligence

**Advanced CSS Variable Support**
- Automatic detection of CSS variables in `:root` and theme-specific selectors
- Context-aware resolution supporting light/dark theme variants
- Nested variable resolution (variables referencing other variables)
- Inline display of resolved values with rich tooltips
- Tooltip shows all theme variants with individual color swatches

### Tailwind CSS Integration

**Smart Tailwind Detection**
- Intelligent recognition of Tailwind utility classes
- Automatic color resolution for Tailwind color classes
- Hover tooltips displaying resolved color values
- Support for Tailwind's compact HSL notation

### CSS Class Color Detection

**Enhanced CSS Class Intelligence**
- Detects CSS classes with color-related properties:
  - `color`
  - `background-color`
  - `border-color`
  - `background`
- Inline color decorations for CSS class names in HTML/JSX
- Rich tooltips showing:
  - Resolved color values
  - CSS property details
  - File locations where classes are defined
- Automatic resolution of CSS variables within class definitions

### Accessibility Features

**WCAG Compliance Tools**
- Built-in WCAG contrast ratio calculations
- Accessibility level indicators displayed in tooltips:
  - **AAA** - Highest level of accessibility
  - **AA** - Standard accessibility level
  - **AA Large** - Accessible for large text
  - **Fail** - Does not meet minimum standards
- Contrast ratios shown against both white and black backgrounds
- Helps ensure your color choices meet accessibility guidelines

### Wide Language Support

**40+ Languages Out of the Box**

The extension works seamlessly across a wide variety of languages and file types:

- **CSS/Styling**: CSS, SCSS, Sass, Less, Stylus, PostCSS
- **Markup**: HTML, XML, SVG
- **JavaScript/TypeScript**: JavaScript, JSX, TypeScript, TSX
- **Modern Frameworks**: Vue, Svelte, Astro
- **Data/Config**: JSON, JSONC, YAML, TOML
- **Markdown**: Markdown, MDX
- **Programming**: Python, Ruby, PHP, Perl, Go, Rust, Java, Kotlin, Swift, C#, C++, C, Objective-C, Dart, Lua
- **Scripting**: Shell Script, PowerShell
- **Query**: SQL, GraphQL
- **Other**: Plain Text

**Fully Customizable**
- Configure language support via the `colorbuddy.languages` setting
- Add or remove languages to fit your workflow
- Use `"*"` to enable color detection in all file types
- Changes apply immediately without reloading

### Commands

Two powerful commands to manage your workspace colors:

- **`ColorBuddy: Re-index CSS Variables`** - Refresh the CSS variable cache to pick up new definitions
- **`ColorBuddy: Show Workspace Color Palette`** - Display all colors found in your workspace

## Getting Started

1. Install ColorBuddy from the VS Code Marketplace
2. Open any supported file type
3. Color indicators will appear automatically next to color values
4. Hover over colors to see detailed information
5. Click on color values to open the native VS Code color picker

## Configuration

Customize which languages ColorBuddy monitors:

```json
{
  "colorbuddy.languages": [
    "css",
    "scss",
    "html",
    "javascript",
    "typescript"
  ]
}
```

## Technical Highlights

- Built with TypeScript for type safety and maintainability
- Webpack bundling for optimized performance
- Comprehensive test suite ensuring reliability
- Efficient caching mechanisms to minimize performance impact
- Smart deduplication to avoid conflicts with VS Code's native color providers

## Requirements

- VS Code version 1.106.1 or higher

## Known Issues

None at this time. Please report any issues on our [GitHub repository](https://github.com/pa-ulander/color-buddy).

## Feedback

We'd love to hear from you! If you have suggestions, feature requests, or encounter any issues, please:
- Open an issue on [GitHub](https://github.com/pa-ulander/color-buddy/issues)
- Leave a review on the VS Code Marketplace

## License

MIT License - See LICENSE file for details

