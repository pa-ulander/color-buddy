# Panel Architecture Documentation

This directory contains the refactored panel system for ColorBuddy's accessibility views. The architecture follows a **modular, separation-of-concerns** pattern to make the codebase easier to maintain and extend.

## Architecture Overview

```
src/services/panels/
├── base/
│   └── BasePanelProvider.ts          # Abstract base class for all panels
├── summary/
│   └── SummaryPanelProvider.ts       # Panel 1: Display Summary
├── wcag/
│   └── WCAGPanelProvider.ts          # Panel 2: WCAG Test Results
├── usages/
│   ├── UsagesPanelProvider.ts        # Panel 3: Find Usages
│   └── UsageSearchService.ts         # Shared search logic
├── formats/
│   └── FormatsPanelProvider.ts       # Panel 4: Format Conversions
└── index.ts                          # Public exports
```

## Design Patterns

### 1. **Strategy Pattern**
Each panel implements its own rendering strategy by extending `BasePanelProvider`. This allows each panel to have unique behavior while sharing common infrastructure.

### 2. **Dependency Injection**
The `UsageSearchService` is injected into both `UsagesPanelProvider` and `FormatsPanelProvider`, ensuring they use the same search logic without duplication.

### 3. **Single Responsibility Principle**
- `BasePanelProvider`: Manages webview lifecycle, styling, and common HTML generation
- Each panel provider: Handles only its specific content rendering
- `UsageSearchService`: Handles only workspace color searches

## Panel Responsibilities

### Panel 1: Summary (SummaryPanelProvider)
**Quick Action**: Display Summary  
**Purpose**: Show color preview, metadata, variable contexts, WCAG status summary, and available formats  
**Data Required**: `AccessibilityViewData` with full context

### Panel 2: WCAG (WCAGPanelProvider)
**Quick Action**: Test Accessibility  
**Purpose**: Show detailed WCAG contrast test results against white and black backgrounds  
**Data Required**: `AccessibilityViewData.report` with contrast samples

### Panel 3: Usages (UsagesPanelProvider)
**Quick Action**: Find Usages  
**Purpose**: Show where a color is used across the workspace (search results)  
**Data Required**: `AccessibilityViewData.usageMatches` populated by `UsageSearchService`

### Panel 4: Formats (FormatsPanelProvider)
**Quick Action**: Convert  
**Purpose**: Show expandable conversion options for each usage match
- One expandable subpanel per usage
- List of available formats with convert/copy/radio buttons
- Bulk conversion button (future feature)  
**Data Required**: Same as Panel 3 + `AccessibilityViewData.conversions`

## Shared Components

### BasePanelProvider
Provides common functionality:
- Webview lifecycle management (`resolveWebviewView`, `updateView`, `reveal`)
- HTML structure generation (`getWebviewHtml`)
- Common styles (`getCustomStyles`)
- Empty state rendering (`renderEmptyState`)
- HTML escaping utilities

**Key Methods**:
```typescript
protected abstract getTitle(): string;
protected abstract getEmptyStateMessage(): string;
protected abstract renderContent(data: AccessibilityViewData | null): string;
```

### UsageSearchService
Handles workspace color searches:
- **Shared by**: `UsagesPanelProvider` and `FormatsPanelProvider`
- **Purpose**: Ensure both panels use identical search logic and results
- **Key Method**: `searchColorUsages(context, progressCallback?): Promise<AccessibilityUsageMatch[]>`
- **Features**:
  - Multi-format search (hex, rgb, hsl, tailwind, css vars, classes)
  - Progressive result callbacks
  - Regex-based workspace search with fallback
  - Configurable file patterns and exclusions

## Data Flow

### Panel 3 & 4 Shared Search Flow
```
Command Handler (extensionController)
    ↓
UsageSearchService.searchColorUsages()
    ↓ (progressive results)
Panel Updates (both UsagesPanelProvider AND FormatsPanelProvider)
    ↓
User sees live search progress in both panels
```

### Key Insight
Panels 3 and 4 receive **the same data** (`usageMatches`), but render it differently:
- **Panel 3**: Simple list of clickable file locations
- **Panel 4**: Expandable conversion boxes with format options per match

## Usage Example

### Creating Panel Instances
```typescript
import { 
  SummaryPanelProvider, 
  WCAGPanelProvider, 
  UsagesPanelProvider, 
  FormatsPanelProvider,
  UsageSearchService 
} from './services/panels';

const usageSearchService = new UsageSearchService(colorParser, colorFormatter);

const panels = {
  summary: new SummaryPanelProvider(extensionUri, 'summary'),
  wcag: new WCAGPanelProvider(extensionUri, 'contrast'),
  usages: new UsagesPanelProvider(extensionUri, 'contexts'),
  formats: new FormatsPanelProvider(extensionUri, 'formats')
};
```

### Updating Panels
```typescript
// Panel-specific update
panels.summary.updateView(accessibilityData);

// Shared search results (updates both panels)
const matches = await usageSearchService.searchColorUsages(context);
const dataWithMatches = { ...accessibilityData, usageMatches: matches };
panels.usages.updateView(dataWithMatches);
panels.formats.updateView(dataWithMatches);  // Same data, different rendering
```

## Benefits of This Architecture

### ✅ Maintainability
- Each panel is self-contained
- Changes to one panel don't affect others
- Clear separation of concerns

### ✅ Testability
- Each panel can be tested independently
- Mock data only needs the fields that panel uses
- `UsageSearchService` can be tested in isolation

### ✅ Extensibility
- Add new panels by extending `BasePanelProvider`
- Share services across panels (like `UsageSearchService`)
- Modify panel behavior without changing base infrastructure

### ✅ Code Reusability
- `BasePanelProvider` handles all common webview boilerplate
- `UsageSearchService` prevents search logic duplication
- Shared types ensure consistency

### ✅ Reduced Complexity
- Before: 1092-line monolithic `AccessibilityViewProvider`
- After: 4 focused panel modules + shared base (~200-300 lines each)

## Migration Notes

The original `AccessibilityViewProvider` now acts as a **facade** that:
1. Instantiates all panel providers
2. Delegates rendering to appropriate panel
3. Maintains backward compatibility with existing code

This allows gradual migration without breaking existing functionality.

## Future Enhancements

### Bulk Conversion Feature (Panel 4)
The UI includes a "Bulk Convert" button (currently disabled) that will:
1. Collect radio button selections across all matches
2. Apply conversions in batches
3. Show progress and allow undo

Implementation requires:
- Message passing between webview and extension
- Transaction-based edit system
- Undo/redo integration

### Panel Communication
Consider implementing an event bus for inter-panel communication if features require it (e.g., selecting in Panel 3 highlights in Panel 4).

## Related Files

- `src/services/accessibilityViewProvider.ts` - Original monolithic provider (now facade)
- `src/services/extensionController.ts` - Command handlers that populate panel data
- `src/types/index.ts` - Shared type definitions
- `src/utils/colorFormatConversions.ts` - Format conversion utilities

## Testing

Each panel should have corresponding test files:
- `src/test/services/panels/summary.test.ts`
- `src/test/services/panels/wcag.test.ts`
- `src/test/services/panels/usages.test.ts`
- `src/test/services/panels/formats.test.ts`
- `src/test/services/panels/usageSearchService.test.ts`

Use the existing test helpers from `src/test/helpers/` for mocking.
