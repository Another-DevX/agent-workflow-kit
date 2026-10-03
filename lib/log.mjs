/**
 * Small logging helper. Streams are injectable so tests can capture output
 * without monkey-patching process.stdout.
 */
export function createLogger(options = {}) {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const dryRun = Boolean(options.dryRun);

  /** @param {string} line */
  const write = (stream, line) => stream.write(`${line}\n`);

  return {
    /** Normal informational output. */
    info(line) {
      write(stdout, line);
    },
    /** A planned action. Prefixed during dry runs. */
    action(line) {
      write(stdout, dryRun ? `[dry-run] ${line}` : line);
    },
    /** Warning; never fatal. */
    warn(line) {
      write(stderr, `warning: ${line}`);
    },
    /** Error; usually fatal. */
    error(line) {
      write(stderr, `error: ${line}`);
    },
    /** Raw output with no decoration. */
    out(line) {
      write(stdout, line);
    },
  };
}
