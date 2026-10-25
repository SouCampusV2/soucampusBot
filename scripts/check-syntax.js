/**
 * `node --check` every .js file under src/ and tests/ — catches syntax errors without starting the bot.
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function jsFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? jsFiles(path) : path.endsWith('.js') ? [path] : [];
  });
}

const files = [...jsFiles('src'), ...jsFiles('tests'), ...jsFiles('scripts')];
const failed = files.filter((file) => {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  return result.status !== 0;
});

if (failed.length) {
  console.error(`FAIL: ${failed.length} file(s) with syntax errors`);
  process.exit(1);
}
console.log(`ok: ${files.length} files`);
