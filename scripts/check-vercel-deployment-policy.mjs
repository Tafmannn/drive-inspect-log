#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
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
