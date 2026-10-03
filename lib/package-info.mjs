import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export const PACKAGE_NAME = pkg.name;
export const PACKAGE_VERSION = pkg.version;
