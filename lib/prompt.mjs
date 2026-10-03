import readline from 'node:readline/promises';

/** @param {{ stdin?: NodeJS.ReadStream, stdout?: NodeJS.WriteStream }} [streams] */
export function isInteractive(streams = {}) {
  const stdin = streams.stdin ?? process.stdin;
  const stdout = streams.stdout ?? process.stdout;
  return Boolean(stdin.isTTY && stdout.isTTY);
}

/**
 * Ask for the verification command. Returns the answer, or the default when the
 * user submits an empty line.
 *
 * @param {{ stdin?: NodeJS.ReadStream, stdout?: NodeJS.WriteStream, defaultValue?: string }} [options]
 * @returns {Promise<string>}
 */
export async function askVerifyCommand(options = {}) {
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  const defaultValue = options.defaultValue ?? '';
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const hint = defaultValue ? ` [${defaultValue}]` : '';
    const answer = (await rl.question(`Verification command${hint}: `)).trim();
    return answer || defaultValue;
  } finally {
    rl.close();
  }
}
