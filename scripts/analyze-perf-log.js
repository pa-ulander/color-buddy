#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function printUsage() {
  const scriptName = path.basename(process.argv[1] || "analyze-perf-log.js");
  console.error(
    `Usage: node ${scriptName} <log-file> [--sort=avg|max|count] [--limit=n] [--json]`
  );
  console.error(
    "Example: node scripts/analyze-perf-log.js logs/metrics/perf-logger-trace-2025-11-24T18-03-49.md --sort=max"
  );
}

function parseArgs(argv) {
  let filePath;
  let sortBy = "avg";
  let limit = 10;
  let json = false;

  for (const arg of argv) {
    if (arg.startsWith("--sort=")) {
      sortBy = arg.slice("--sort=".length);
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const value = Number(arg.slice("--limit=".length));
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Invalid --limit value: ${arg}`);
      }
      limit = Math.floor(value);
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (!filePath) {
      filePath = arg;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }

  if (!filePath) {
    throw new Error("Missing log file path");
  }

  if (!["avg", "max", "count"].includes(sortBy)) {
    throw new Error(`Unsupported sort field: ${sortBy}`);
  }

  return { filePath, sortBy, limit, json };
}

function extractTotalEvents(content) {
  const match = content.match(/Total Events:\s*(\d+)/);
  return match ? Number(match[1]) : undefined;
}

function extractMetrics(content) {
  const summaryHeader = "Performance Metrics Summary:";
  const headerIndex = content.indexOf(summaryHeader);
  if (headerIndex === -1) {
    throw new Error(
      'Unable to find "Performance Metrics Summary" block in log'
    );
  }

  const block = content.slice(headerIndex + summaryHeader.length).split("\n");
  const metrics = [];

  for (const rawLine of block) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.startsWith("=") || line.startsWith("-")) {
      continue;
    }

    const countIndex = line.indexOf("count=");
    if (countIndex === -1) {
      continue;
    }

    const labelSegment = line.slice(0, countIndex);
    const colonIndex = labelSegment.lastIndexOf(":");
    if (colonIndex === -1) {
      continue;
    }

    const label = labelSegment.slice(0, colonIndex).trim();
    const payload = line.slice(countIndex);

    const countMatch = payload.match(/count=(\d+)/);
    const avgMatch = payload.match(/avg=([\d.]+)ms/);
    const minMatch = payload.match(/min=([\d.]+)ms/);
    const maxMatch = payload.match(/max=([\d.]+)ms/);

    if (!countMatch || !avgMatch || !minMatch || !maxMatch) {
      // Skip malformed lines but keep the script resilient.
      continue;
    }

    metrics.push({
      label,
      count: Number(countMatch[1]),
      avg: Number(avgMatch[1]),
      min: Number(minMatch[1]),
      max: Number(maxMatch[1]),
    });
  }

  if (metrics.length === 0) {
    throw new Error("No metrics parsed from log summary");
  }

  return metrics;
}

function sortMetrics(metrics, field) {
  switch (field) {
    case "avg":
      return [...metrics].sort((a, b) => b.avg - a.avg);
    case "max":
      return [...metrics].sort((a, b) => b.max - a.max);
    case "count":
      return [...metrics].sort((a, b) => b.count - a.count);
    default:
      return metrics;
  }
}

function formatTable(metrics) {
  const labelWidth = Math.max(5, ...metrics.map((item) => item.label.length));
  const header = `${"Label".padEnd(labelWidth)}  ${"Count".padStart(
    5
  )}  ${"Avg (ms)".padStart(8)}  ${"Min (ms)".padStart(
    8
  )}  ${"Max (ms)".padStart(8)}`;
  const rows = metrics.map((item) => {
    return `${item.label.padEnd(labelWidth)}  ${String(item.count).padStart(
      5
    )}  ${item.avg.toFixed(2).padStart(8)}  ${item.min
      .toFixed(2)
      .padStart(8)}  ${item.max.toFixed(2).padStart(8)}`;
  });
  return [header, ...rows].join("\n");
}

function buildObservations(metrics) {
  const observations = [];
  const applyStage = metrics.find(
    (item) => item.label === "applyCSSVariableDecorations"
  );
  const computeStage = metrics.find(
    (item) => item.label === "computeColorData"
  );
  const refreshStages = metrics.filter((item) =>
    item.label.startsWith("refreshEditor.execute")
  );

  if (applyStage) {
    observations.push(
      `Decoration apply averages ${applyStage.avg.toFixed(
        2
      )}ms (max ${applyStage.max.toFixed(2)}ms) across ${
        applyStage.count
      } runs.`
    );
  }

  if (computeStage) {
    observations.push(
      `Color detection remains light at ${computeStage.avg.toFixed(2)}ms avg.`
    );
  }

  if (refreshStages.length > 0) {
    const slowest = [...refreshStages].sort((a, b) => b.max - a.max)[0];
    observations.push(
      `Slowest refresh editor path: ${slowest.label} avg ${slowest.avg.toFixed(
        2
      )}ms (max ${slowest.max.toFixed(2)}ms).`
    );
  }

  return observations;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const resolvedPath = path.resolve(process.cwd(), options.filePath);
    const content = await fs.promises.readFile(resolvedPath, "utf8");
    const totalEvents = extractTotalEvents(content);
    const metrics = extractMetrics(content);
    const sorted = sortMetrics(metrics, options.sortBy).slice(0, options.limit);

    if (options.json) {
      const payload = {
        file: resolvedPath,
        totalEvents,
        sortBy: options.sortBy,
        metrics: sorted,
      };
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    console.log(`Analyzing ${resolvedPath}`);
    if (typeof totalEvents === "number") {
      console.log(`Total events: ${totalEvents}`);
    }
    console.log(
      `Sorted by ${options.sortBy} (top ${sorted.length} of ${metrics.length} metrics):\n`
    );
    console.log(formatTable(sorted));

    const observations = buildObservations(metrics);
    if (observations.length > 0) {
      console.log("\nObservations:");
      for (const note of observations) {
        console.log(` - ${note}`);
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    printUsage();
    process.exitCode = 1;
  }
}

main();
