// Refuses a real bench that gate-lock.sh didn't start, so its timings never compete with another run.
import { isAbsolute } from "node:path";

function quote(argument) {
  if (/^[A-Za-z0-9_./:,+=@%-]+$/.test(argument)) {
    return argument;
  }

  return "'" + argument.replaceAll("'", "'\\''") + "'";
}

// The run's arguments, to follow the retry's own "--". pnpm passes that "--" to the script
// first, and a runner's own flags (the router's --workload) and the shared parser both read a
// leading "--" as nothing. So the retry keeps every argument as the run had it, minus the run's
// leading "--"s, and reads exactly as the run did.
export function retryArguments(args) {
  let start = 0;

  while (args[start] === "--") {
    start++;
  }

  return args.slice(start);
}

// Whether --out or --check names a relative path, read from the shared flags bench() parses
// (argv, after a runner takes its own) with bench.mjs's parseArguments rules: a "--" where a flag
// goes is skipped, --deterministic takes no value, --check takes the next argument unless it
// starts with "--", and every other flag takes the next argument, whatever it is.
export function namesRelativePath(argv) {
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--" || argument === "--deterministic") {
      continue;
    }

    const value = argv[index + 1];

    if (value === undefined) {
      continue;
    }

    if (argument === "--check" && value.startsWith("--")) {
      continue;
    }

    index++;

    if ((argument === "--out" || argument === "--check") && !isAbsolute(value)) {
      return true;
    }
  }

  return false;
}

// Exits 1 unless gate-lock.sh started this process, printing `command`, a repo-root
// `pnpm --dir <package> run <script> --`, followed by this run's arguments. argv is the shared
// flags bench() parses.
export function assertGateLock(command, argv) {
  if (process.env.LOOZO_GATE_LOCK_HELD === "1") {
    return;
  }

  const words = [command];

  for (const argument of retryArguments(process.argv.slice(2))) {
    words.push(quote(argument));
  }

  console.error(
    `this run needs the machine-wide gate lock. Run it from the repo root as:\n  ${words.join(" ")}`,
  );

  if (namesRelativePath(argv)) {
    const directory = command.match(/--dir (\S+)/)[1];
    console.error(`(relative paths resolve from ${directory} there; pass absolute paths)`);
  }

  process.exit(1);
}
