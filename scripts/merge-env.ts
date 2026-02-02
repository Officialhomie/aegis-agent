/**
 * Merge .env.example into .env without overwriting existing variables.
 * Only adds keys that are present in .env.example but missing in .env.
 *
 * Usage: npx tsx scripts/merge-env.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(__dirname, '..');
const envPath = resolve(root, '.env');
const examplePath = resolve(root, '.env.example');

// Match KEY=value (KEY is identifier, value is rest of line, may be quoted)
const KEY_VALUE = /^([A-Za-z_][A-Za-z0-9_]*)\s*=/;

function getKeys(content: string): Set<string> {
  const keys = new Set<string>();
  for (const line of content.split('\n')) {
    const m = line.match(KEY_VALUE);
    if (m) keys.add(m[1]);
  }
  return keys;
}

function main() {
  let envContent: string;
  let exampleContent: string;
  try {
    envContent = readFileSync(envPath, 'utf-8');
  } catch {
    console.error('.env not found. Copy .env.example to .env first.');
    process.exit(1);
  }
  try {
    exampleContent = readFileSync(examplePath, 'utf-8');
  } catch {
    console.error('.env.example not found.');
    process.exit(1);
  }

  const existingKeys = getKeys(envContent);
  const linesToAdd: string[] = [];
  let inNewSection = false;
  for (const line of exampleContent.split('\n')) {
    const m = line.match(KEY_VALUE);
    if (m) {
      const key = m[1];
      if (!existingKeys.has(key)) {
        if (!inNewSection) {
          linesToAdd.push('', '# Added from .env.example (missing keys only)');
          inNewSection = true;
        }
        linesToAdd.push(line);
      }
    }
  }

  if (linesToAdd.length === 0) {
    console.log('No new variables to add. .env is up to date.');
    return;
  }

  const merged = envContent.replace(/\n?$/, '\n') + linesToAdd.join('\n') + '\n';
  writeFileSync(envPath, merged, 'utf-8');
  console.log('Updated .env with', linesToAdd.filter((l) => KEY_VALUE.test(l)).length, 'new variable(s).');
}

main();
