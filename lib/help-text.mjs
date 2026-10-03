export const USAGE = `agent-workflow

Install and maintain the agent workflow kit in a project.

Usage:
  agent-workflow init   [options]
  agent-workflow update [options]
  agent-workflow doctor [options]
  agent-workflow help

Commands:
  init      Install templates, project config, and the managed manifest.
  update    Refresh managed files that have not been edited locally.
  doctor    Check repository, installed files, verification config, known-good.
  help      Show this message.

Options:
  --target <path>          Target project directory (default: current directory).
  --verify <command>       Verification command stored in project config.
  --verify-full <command>  Full verification command (default: --verify value).
  --setup <command>        Optional setup command (default: "true").
  --scope <document>       Optional scope document (default: "AGENTS.md").
  --dry-run                Show what would change without writing anything.
  -h, --help               Show help.
  -v, --version            Show the CLI version.

Notes:
  - init asks for the verification command when run interactively and no
    --verify value is supplied.
  - When a project already has scripts/verify.sh, init preserves it and uses
    "bash scripts/verify.sh" as the verification command instead of installing
    the generic wrapper.
  - update never overwrites files with local edits; it reports conflicts and
    writes nothing.
  - doctor never executes the verification command.
`;
