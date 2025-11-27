#!/usr/bin/env node
/**
 * Renames playwright packages for publishing under a custom scope/name.
 * Run this after build, before publish.
 *
 * Usage:
 *   node utils/rename-packages.js            # uses @mcpu scope (default)
 *   node utils/rename-packages.js @yourscope
 *   node utils/rename-packages.js @yourscope/pw  # custom prefix
 *   node utils/rename-packages.js --restore      # restore original names
 */

const DEFAULT_SCOPE = '@mcpu';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PACKAGES_DIR = path.join(ROOT, 'packages');

// Packages that need renaming and their original names
const PACKAGES = [
  { dir: 'playwright-core', originalName: 'playwright-core' },
  { dir: 'playwright', originalName: 'playwright' },
];

// Backup file to store original state
const BACKUP_FILE = path.join(ROOT, '.package-names-backup.json');

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function getNewName(originalName, scope) {
  // @scope -> @scope/playwright-core, @scope/playwright
  // @scope/pw -> @scope/pw-core, @scope/pw
  if (scope.includes('/')) {
    // Custom prefix like @scope/pw
    const base = scope.split('/')[1];
    if (originalName === 'playwright-core') {
      return `${scope}-core`;
    }
    return scope;
  } else {
    // Just scope like @scope
    return `${scope}/${originalName}`;
  }
}

function rename(scope) {
  const backup = {};

  for (const pkg of PACKAGES) {
    const pkgJsonPath = path.join(PACKAGES_DIR, pkg.dir, 'package.json');
    const pkgJson = readJSON(pkgJsonPath);

    // Save original for backup
    backup[pkg.dir] = {
      name: pkgJson.name,
      dependencies: pkgJson.dependencies ? { ...pkgJson.dependencies } : undefined,
    };

    // Rename package
    const newName = getNewName(pkg.originalName, scope);
    console.log(`  ${pkgJson.name} -> ${newName}`);
    pkgJson.name = newName;

    // Update dependency on playwright-core if present
    if (pkgJson.dependencies && pkgJson.dependencies['playwright-core']) {
      const version = pkgJson.dependencies['playwright-core'];
      delete pkgJson.dependencies['playwright-core'];
      const newCoreName = getNewName('playwright-core', scope);
      pkgJson.dependencies[newCoreName] = version;
      console.log(`    dependency: playwright-core -> ${newCoreName}`);
    }

    writeJSON(pkgJsonPath, pkgJson);
  }

  // Save backup
  writeJSON(BACKUP_FILE, backup);
  console.log(`\nBackup saved to ${BACKUP_FILE}`);
  console.log('Run with --restore to revert changes');
}

function restore() {
  if (!fs.existsSync(BACKUP_FILE)) {
    console.error('No backup file found. Nothing to restore.');
    process.exit(1);
  }

  const backup = readJSON(BACKUP_FILE);

  for (const pkg of PACKAGES) {
    const pkgJsonPath = path.join(PACKAGES_DIR, pkg.dir, 'package.json');
    const pkgJson = readJSON(pkgJsonPath);
    const original = backup[pkg.dir];

    if (!original) continue;

    console.log(`  ${pkgJson.name} -> ${original.name}`);
    pkgJson.name = original.name;

    if (original.dependencies) {
      pkgJson.dependencies = original.dependencies;
    }

    writeJSON(pkgJsonPath, pkgJson);
  }

  fs.unlinkSync(BACKUP_FILE);
  console.log('\nRestored original package names. Backup removed.');
}

function printUsage() {
  console.log(`
Usage:
  node utils/rename-packages.js             Rename with default scope (${DEFAULT_SCOPE})
  node utils/rename-packages.js <scope>     Rename packages with custom scope
  node utils/rename-packages.js --restore   Restore original names

Examples:
  node utils/rename-packages.js
    playwright-core -> ${DEFAULT_SCOPE}/playwright-core
    playwright      -> ${DEFAULT_SCOPE}/playwright

  node utils/rename-packages.js @myscope/pw
    playwright-core -> @myscope/pw-core
    playwright      -> @myscope/pw
`);
}

// Main
const arg = process.argv[2];

if (arg === '--help' || arg === '-h') {
  printUsage();
  process.exit(0);
}

if (arg === '--restore') {
  console.log('Restoring original package names...\n');
  restore();
} else {
  const scope = arg && arg.startsWith('@') ? arg : DEFAULT_SCOPE;
  if (arg && !arg.startsWith('@')) {
    console.error(`Error: scope must start with @, using default: ${DEFAULT_SCOPE}\n`);
  }
  console.log(`Renaming packages with scope: ${scope}\n`);
  rename(scope);
}
