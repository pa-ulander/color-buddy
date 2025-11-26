import * as vscode from 'vscode';

export interface AccessibilitySample {
	label: string;
	backgroundDescription: string;
	backgroundColor: vscode.Color;
	contrastRatio: number;
	level: string;
	passes: string[];
}

export interface AccessibilityReport {
	samples: AccessibilitySample[];
}
