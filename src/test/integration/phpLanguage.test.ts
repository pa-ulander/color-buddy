import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { createControllerHarness } from '../helpers/controllerHarness';
import type { ColorData } from '../../types';

suite('PHP Language Support', () => {
    test('detects literal colors and provides hover details in PHP documents', async () => {
        const { controller, restore } = await createControllerHarness();
        try {
            const extensionRoot = vscode.Uri.file(path.join(__dirname, '..', '..', '..'));
            const uri = vscode.Uri.joinPath(extensionRoot, 'src', 'test', 'integration', 'fixtures', 'php', 'color-snippets.php');
            const document = await vscode.workspace.openTextDocument(uri);

            const ensureColorData = (controller as unknown as { ensureColorData(document: vscode.TextDocument): Promise<ColorData[]> }).ensureColorData.bind(controller);
            const colorData = await ensureColorData(document);
            assert.ok(colorData.length >= 5, 'expected multiple color matches in PHP document');

            const provider = (controller as unknown as { provider: {
                provideDocumentColors(data: any[]): vscode.ColorInformation[];
                provideHover(data: any[], position: vscode.Position): Promise<vscode.Hover | undefined>;
            } }).provider;

            const documentText = document.getText();
            const colorInfos = provider.provideDocumentColors(colorData);
            const expectedLiterals = [
                '#FF5733',
                'rgb(34, 139, 34)',
                'hsl(200 100% 50%)',
                '#1e90ff',
                'rgba(255, 255, 255, 0.75)',
                '#ABCDEF',
                '240 100% 50%'
            ];
            const normalizedText = (range: vscode.Range) => document.getText(range);
            for (const literal of expectedLiterals) {
                const matchIndex = documentText.indexOf(literal);
                assert.ok(matchIndex >= 0, `expected to find literal ${literal} in fixture`);
                const matchRange = new vscode.Range(document.positionAt(matchIndex), document.positionAt(matchIndex + literal.length));
                const matchData = colorData.find(entry => entry.range.isEqual(matchRange));
                assert.ok(matchData, `expected color data entry for ${literal}`);
                assert.strictEqual(normalizedText(matchData.range), literal, `range text mismatch for ${literal}`);

                assert.ok(colorInfos.some(info => normalizedText(info.range) === literal), `color provider should surface ${literal}`);

                const hover = await provider.provideHover(colorData, matchRange.start);
                assert.ok(hover, `expected hover for ${literal}`);
                const markdown = hover!.contents[0] as vscode.MarkdownString;
                const value = markdown.value;
                assert.ok(value.includes('![color swatch]'), `hover should include swatch for ${literal}`);
                assert.ok(value.includes('Color Preview'), `hover should include heading for ${literal}`);
            }
        } finally {
            restore();
        }
    }).timeout(10000);
});
