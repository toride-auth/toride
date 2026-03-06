#!/usr/bin/env node
// T099: toride-codegen CLI entry point

import { readFileSync, writeFileSync, watchFile } from "node:fs";
import { resolve } from "node:path";
import { loadYaml, loadJson } from "toride";
import { generateTypes } from "./generator.js";

function usage(): void {
  console.log(`Usage: toride-codegen <policy-file> -o <output-file> [--watch]

Arguments:
  policy-file          Path to policy YAML or JSON file

Options:
  -o, --output <path>  Output file path (required)
  --watch              Re-generate on policy file change
  -h, --help           Show this help message`);
}

async function loadPolicy(filePath: string) {
  const resolved = resolve(filePath);
  if (resolved.endsWith(".json")) {
    return loadJson(resolved);
  }
  return loadYaml(resolved);
}

async function generate(policyPath: string, outputPath: string): Promise<void> {
  const policy = await loadPolicy(policyPath);
  const types = generateTypes(policy);
  writeFileSync(resolve(outputPath), types, "utf-8");
  console.log(`Generated types written to ${outputPath}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("-h") || args.includes("--help") || args.length === 0) {
    usage();
    process.exit(0);
  }

  let policyFile: string | undefined;
  let outputFile: string | undefined;
  let watch = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-o" || arg === "--output") {
      outputFile = args[++i];
    } else if (arg === "--watch") {
      watch = true;
    } else if (!arg.startsWith("-")) {
      policyFile = arg;
    }
  }

  if (!policyFile) {
    console.error("Error: policy file is required");
    usage();
    process.exit(1);
  }

  if (!outputFile) {
    console.error("Error: -o/--output is required");
    usage();
    process.exit(1);
  }

  await generate(policyFile, outputFile);

  if (watch) {
    console.log(`Watching ${policyFile} for changes...`);
    let debounce: ReturnType<typeof setTimeout> | null = null;
    watchFile(resolve(policyFile), { interval: 500 }, () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(async () => {
        try {
          await generate(policyFile!, outputFile!);
        } catch (err) {
          console.error("Error regenerating types:", err);
        }
      }, 200);
    });
  }
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
