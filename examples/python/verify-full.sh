#!/usr/bin/env bash
#
# Full verification for the Python example.
#
set -euo pipefail

pytest -q
ruff check .
