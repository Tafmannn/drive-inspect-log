#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const raw = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');
const config = JSON.parse(raw);
// JSON.parse silently keeps the LAST duplicate key, so a second "git" block
// could override the reviewed one unnoticed. Each section must appear once.
for (const key of ['"git"', '"deploymentEnabled"', '"rewrites"']) {
  assert.equal(raw.split(key).length - 1, 1, `vercel.json must contain ${key} exactly once`);
}
const expected = {
  '**': false,
  main: true,
  'deploy-preview/**': true,
};

assert.deepEqual(config.git?.deploymentEnabled, expected,
  'Vercel Git deployment allowlist changed: review AGENTS.md and docs/deployment-control.md');
assert.deepEqual(config.rewrites, [
  { source: '/(.*)', destination: '/index.html' },
], 'Preserve the existing SPA rewrite');
console.log('PASS: production main and deliberate deploy-preview/** enabled; all other branches disabled');
