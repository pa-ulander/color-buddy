import * as vscode from 'vscode';

export type AccessibilityOutcome = 'pass' | 'fail';

export interface AccessibilityCheck {
	label: string;
	outcome: AccessibilityOutcome;
}

export interface AccessibilitySample {
	label: string;
	backgroundDescription: string;
	backgroundColor: vscode.Color;
	contrastRatio: number;
	level: string;
	checks: AccessibilityCheck[];
}

export interface AccessibilityReport {
	samples: AccessibilitySample[];
}
