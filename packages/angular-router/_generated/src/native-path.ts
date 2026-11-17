import {
  angularPath,
  destinationRecord,
  type AnyRoute,
  type Destination,
} from "@loozo/angular-router/_core";

/** A record's Angular `path`: its destination's local segments, in this build's text. */
export function nativePath(destination: Destination<AnyRoute>): string {
  return angularPath(destinationRecord(destination).url.localSegments);
}

/** A hoisted redirect record's Angular `path`: its destination's effective segments, in this build's text. */
export function effectivePath(destination: Destination<AnyRoute>): string {
  return angularPath(destinationRecord(destination).url.segments);
}
