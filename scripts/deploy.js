/**
 * Manual deploy to a `gh-pages` branch.
 *
 * The GitHub Actions workflow in .github/workflows/deploy.yml is the normal path.
 * This script exists for the case where you want to publish right now without
 * pushing to main, or where Actions isn't set up yet.
 *
 * Usage:
 *   node scripts/deploy.js                 # build + publish to gh-pages
 *   node scripts/deploy.js --skip-build    # publish the existing dist/
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const BRANCH = 'gh-pages';

const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
}

function capture(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

// ---- Preconditions, each with an actionable message ----

if (!capture('git rev-parse --is-inside-work-tree')) {
  console.error(
    'Not a git repository yet.\n\n' +
      'Set one up first:\n' +
      '  git init\n' +
      '  git add -A && git commit -m "Miami Spice Navigator"\n' +
      '  git branch -M main\n' +
      '  git remote add origin https://github.com/<you>/<repo>.git\n' +
      '  git push -u origin main\n',
  );
  process.exit(1);
}

const remote = capture('git remote get-url origin');
if (!remote) {
  console.error(
    'No `origin` remote configured.\n\n' +
      'Add one, then re-run:\n' +
      '  git remote add origin https://github.com/<you>/<repo>.git\n',
  );
  process.exit(1);
}

console.log(`origin: ${remote}`);

// ---- Build ----

if (!skipBuild) {
  // Derive the Pages subpath from the repo name so asset URLs resolve.
  const repoName = remote
    .replace(/\.git$/, '')
    .split(/[/:]/)
    .pop();
  const isUserSite = /\.github\.io$/.test(repoName);
  const basePath = isUserSite ? '/' : `/${repoName}/`;

  console.log(`building with BASE_PATH=${basePath}`);
  run('npm run build', { env: { ...process.env, BASE_PATH: basePath } });
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/index.html not found — build first (drop --skip-build).');
  process.exit(1);
}

// Pages serves the artifact as-is; .nojekyll stops it from hiding _-prefixed files.
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

// ---- Publish ----

console.log(`\npublishing dist/ to ${BRANCH}...`);

// `git subtree push` needs dist committed; a throwaway worktree is cleaner and
// leaves the working tree untouched.
const tmpWorktree = path.join(ROOT, '.deploy-worktree');

try {
  execSync(`git worktree remove "${tmpWorktree}" --force`, { cwd: ROOT, stdio: 'ignore' });
} catch {
  /* nothing to clean up */
}

const branchExists = capture(`git ls-remote --heads origin ${BRANCH}`);

if (branchExists) {
  run(`git fetch origin ${BRANCH}`);
  run(`git worktree add "${tmpWorktree}" ${BRANCH}`);
} else {
  run(`git worktree add --detach "${tmpWorktree}"`);
  run(`git -C "${tmpWorktree}" checkout --orphan ${BRANCH}`);
  run(`git -C "${tmpWorktree}" reset --hard`);
}

try {
  // Replace the branch contents wholesale, keeping .git.
  for (const entry of fs.readdirSync(tmpWorktree)) {
    if (entry === '.git') continue;
    fs.rmSync(path.join(tmpWorktree, entry), { recursive: true, force: true });
  }
  fs.cpSync(DIST, tmpWorktree, { recursive: true });

  run(`git -C "${tmpWorktree}" add -A`);

  const hasChanges = capture(`git -C "${tmpWorktree}" status --porcelain`);
  if (!hasChanges) {
    console.log('nothing changed — already up to date.');
  } else {
    run(`git -C "${tmpWorktree}" commit -m "Deploy ${new Date().toISOString()}"`);
    run(`git -C "${tmpWorktree}" push origin ${BRANCH}`);
    console.log('\npushed.');
  }

  const httpsUrl = remote
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git$/, '');
  const [, owner, repo] = httpsUrl.match(/github\.com\/([^/]+)\/([^/]+)/) ?? [];
  if (owner && repo) {
    const site = /\.github\.io$/.test(repo)
      ? `https://${repo}/`
      : `https://${owner}.github.io/${repo}/`;
    console.log(`\nSite: ${site}`);
    console.log(
      `If it 404s, enable Pages: ${httpsUrl}/settings/pages → Source = "Deploy from a branch" → ${BRANCH} / root.`,
    );
  }
} finally {
  try {
    execSync(`git worktree remove "${tmpWorktree}" --force`, { cwd: ROOT, stdio: 'ignore' });
  } catch {
    console.warn(`\nCould not auto-remove ${tmpWorktree} — delete it by hand if it remains.`);
  }
}
