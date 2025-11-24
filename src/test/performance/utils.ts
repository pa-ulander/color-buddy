export function buildLargeCssDocument(variableCount = 200, blockCount = 600): string {
	const lines: string[] = [];
	lines.push(':root {');
	for (let index = 0; index < variableCount; index++) {
		const hue = index % 360;
		lines.push(`  --color-${index}: ${hue} 60% 55%;`);
	}
	lines.push('}\n');

	for (let block = 0; block < blockCount; block++) {
		const primaryVar = `--color-${block % variableCount}`;
		const secondaryVar = `--color-${(block + 1) % variableCount}`;
		lines.push(`.component-${block} {`);
		lines.push(`  color: var(${primaryVar});`);
		lines.push(`  background-color: var(${secondaryVar});`);
		lines.push(`  @apply bg-color-${block % variableCount} text-color-${(block + 1) % variableCount};`);
		lines.push('}\n');
		lines.push(`.component-${block} .nested-${block} {`);
		lines.push(`  border-color: var(${primaryVar});`);
		lines.push(`  outline-color: var(${secondaryVar});`);
		lines.push('}\n');
	}

	return lines.join('\n');
}
