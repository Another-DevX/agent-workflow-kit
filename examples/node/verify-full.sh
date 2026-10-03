#!/usr/bin/env bash
#
# Full verification for the Node.js example.
#
set -euo pipefail

npm test
npm run lint
