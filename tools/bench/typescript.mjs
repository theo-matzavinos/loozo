// Reads `tsc --extendedDiagnostics` output.

export function parseDiagnostics(output) {
  const diagnostics = {};

  for (const line of output.split("\n")) {
    const match = line.match(/^([A-Z][\w ./-]*?):\s+(\S+)\s*$/);

    if (match) {
      diagnostics[match[1]] = match[2];
    }
  }

  for (const name of ["Check time", "Instantiations", "Memory used"]) {
    if (!Object.hasOwn(diagnostics, name)) {
      throw new Error(`tsc --extendedDiagnostics printed no "${name}"`);
    }
  }

  return diagnostics;
}
