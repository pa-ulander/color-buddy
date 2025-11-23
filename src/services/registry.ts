/**
 * Registry Service for CSS Variables and Classes
 * 
 * Manages storage and retrieval of CSS variable declarations and CSS class color declarations.
 * Provides sorted access and URI-based filtering.
 */

import * as vscode from 'vscode';
import type { CSSVariableDeclaration, CSSClassColorDeclaration } from '../types';

/**
 * Central registry for CSS variables and class declarations
 */
export class Registry {
    private cssVariables: Map<string, CSSVariableDeclaration[]>;
    private cssClasses: Map<string, CSSClassColorDeclaration[]>;

    constructor() {
        this.cssVariables = new Map();
        this.cssClasses = new Map();
    }

    /**
     * Add a CSS variable declaration
     */
    addVariable(name: string, declaration: CSSVariableDeclaration): void {
        const existing = this.cssVariables.get(name) ?? [];
        const updated = [...existing, declaration].sort((a, b) => a.context.specificity - b.context.specificity);
        this.cssVariables.set(name, updated);
    }

    /**
     * Get all declarations for a CSS variable
     */
    getVariable(name: string): CSSVariableDeclaration[] | undefined {
        return this.cssVariables.get(name);
    }

    /**
     * Get CSS variable declarations sorted by specificity (lowest first)
     */
    getVariablesSorted(name: string): CSSVariableDeclaration[] {
        const declarations = this.cssVariables.get(name);
        if (!declarations || declarations.length === 0) {
            return [];
        }
        return [...declarations];
    }

    /**
     * Add a CSS class color declaration
     */
    addClass(name: string, declaration: CSSClassColorDeclaration): void {
        const existing = this.cssClasses.get(name) || [];
        existing.push(declaration);
        this.cssClasses.set(name, existing);
    }

    /**
     * Get all declarations for a CSS class
     */
    getClass(name: string): CSSClassColorDeclaration[] | undefined {
        return this.cssClasses.get(name);
    }

    /**
     * Get all CSS class names
     */
    getClassesSorted(): string[] {
        return Array.from(this.cssClasses.keys()).sort();
    }

    /**
     * Remove all declarations from a specific file URI
     */
    removeByUri(uri: vscode.Uri): void {
        this.removeVariablesByUri(uri);
        this.removeClassesByUri(uri);
    }

    /**
     * Clear all variables and classes
     */
    clear(): void {
        this.cssVariables.clear();
        this.cssClasses.clear();
    }

    /**
     * Get the number of unique CSS variables
     */
    get variableCount(): number {
        return this.cssVariables.size;
    }

    /**
     * Get the number of unique CSS classes
     */
    get classCount(): number {
        return this.cssClasses.size;
    }

    /**
     * Get all variable names
     */
    getAllVariableNames(): string[] {
        return Array.from(this.cssVariables.keys());
    }

    /**
     * Get all class names
     */
    getAllClassNames(): string[] {
        return Array.from(this.cssClasses.keys());
    }

    /**
     * Check if a variable exists
     */
    hasVariable(name: string): boolean {
        return this.cssVariables.has(name);
    }

    /**
     * Check if a class exists
     */
    hasClass(name: string): boolean {
        return this.cssClasses.has(name);
    }

    /**
     * Replace all variable declarations for a given URI.
     * Removes stale declarations before inserting the provided ones.
     */
    replaceVariablesForUri(uri: vscode.Uri, declarations: CSSVariableDeclaration[]): void {
        this.removeVariablesByUri(uri);

        const grouped = new Map<string, CSSVariableDeclaration[]>();
        for (const declaration of declarations) {
            const existing = grouped.get(declaration.name) ?? [];
            existing.push(declaration);
            grouped.set(declaration.name, existing);
        }

        for (const [name, decls] of grouped) {
            const existing = this.cssVariables.get(name) ?? [];
            const merged = [...existing, ...decls].sort((a, b) => a.context.specificity - b.context.specificity);
            this.cssVariables.set(name, merged);
        }
    }

    /**
     * Replace all CSS class declarations for a given URI.
     */
    replaceClassesForUri(uri: vscode.Uri, declarations: CSSClassColorDeclaration[]): void {
        this.removeClassesByUri(uri);

        const grouped = new Map<string, CSSClassColorDeclaration[]>();
        for (const declaration of declarations) {
            const existing = grouped.get(declaration.className) ?? [];
            existing.push(declaration);
            grouped.set(declaration.className, existing);
        }

        for (const [className, decls] of grouped) {
            const existing = this.cssClasses.get(className) ?? [];
            this.cssClasses.set(className, [...existing, ...decls]);
        }
    }

    private removeVariablesByUri(uri: vscode.Uri): void {
        const uriString = uri.toString();
        for (const [name, declarations] of this.cssVariables.entries()) {
            const filtered = declarations.filter(decl => decl.uri.toString() !== uriString);
            if (filtered.length === 0) {
                this.cssVariables.delete(name);
            } else if (filtered.length !== declarations.length) {
                this.cssVariables.set(name, filtered);
            }
        }
    }

    private removeClassesByUri(uri: vscode.Uri): void {
        const uriString = uri.toString();
        for (const [name, declarations] of this.cssClasses.entries()) {
            const filtered = declarations.filter(decl => decl.uri.toString() !== uriString);
            if (filtered.length === 0) {
                this.cssClasses.delete(name);
            } else if (filtered.length !== declarations.length) {
                this.cssClasses.set(name, filtered);
            }
        }
    }
}
