/**
 * Sort comparator for connected elements in document order; disconnected or unrelated pairs
 * compare equal. Numeric DOM flags avoid requiring a browser-global `Node` on the server.
 */
export function documentOrder(left: Element, right: Element): number {
  const position = left.compareDocumentPosition(right);

  if ((position & 1) !== 0) {
    return 0;
  }

  if ((position & 4) !== 0) {
    return -1;
  }

  if ((position & 2) !== 0) {
    return 1;
  }

  return 0;
}
