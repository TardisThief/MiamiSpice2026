/**
 * Cross-platform "am I the entrypoint?" check.
 *
 * `import.meta.url === 'file://' + process.argv[1]` is the common idiom but it is
 * wrong on Windows: argv[1] is `C:\path\file.js` while import.meta.url is
 * `file:///C:/path/file.js`. Comparing resolved paths sidesteps drive-letter
 * casing and slash direction entirely.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function isMain(metaUrl) {
  if (!process.argv[1]) return false;
  const self = path.resolve(fileURLToPath(metaUrl));
  const invoked = path.resolve(process.argv[1]);
  return self.toLowerCase() === invoked.toLowerCase();
}

/** Parse `--flag` and `--key=value` argv into an object. */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [k, v] = arg.slice(2).split('=');
      out[k.replace(/-/g, '_')] = v === undefined ? true : v;
    } else {
      out._.push(arg);
    }
  }
  return out;
}
