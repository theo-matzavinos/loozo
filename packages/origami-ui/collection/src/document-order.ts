// Numeric DOM flags avoid requiring a browser-global `Node` on the server.
const DISCONNECTED = 1;
const PRECEDING = 2;
const FOLLOWING = 4;
const DOCUMENT_FRAGMENT = 11;

/**
 * @internal Package-private, exported as `ɵdocumentOrder` for Menu; not an application API. Sort
 * comparator for connected elements in document order, also across open shadow roots: an
 * element in a shadow root sorts where its shadow host does, after the host and before the
 * host's light-DOM children. Elements in no common tree compare equal.
 */
export function documentOrder(left: Element, right: Element): number {
  const position = left.compareDocumentPosition(right);

  // Elements in two different tree roots are disconnected even in one document.
  if ((position & DISCONNECTED) === 0) {
    return orderOf(position);
  }

  const lefts = hostChain(left);
  const rights = hostChain(right);

  // The first pair in one tree, from the left's innermost root outwards, is in the closest root
  // the two share.
  for (let leftIndex = 0; leftIndex < lefts.length; leftIndex++) {
    for (let rightIndex = 0; rightIndex < rights.length; rightIndex++) {
      const leftNode = lefts[leftIndex];
      const rightNode = rights[rightIndex];

      // One element is the other's shadow host, which comes first.
      if (leftNode === rightNode) {
        if (leftIndex === 0) {
          return -1;
        }

        return 1;
      }

      const shared = leftNode.compareDocumentPosition(rightNode);

      if ((shared & DISCONNECTED) === 0) {
        return orderOf(shared);
      }
    }
  }

  return 0;
}

function orderOf(position: number): number {
  if ((position & FOLLOWING) !== 0) {
    return -1;
  }

  if ((position & PRECEDING) !== 0) {
    return 1;
  }

  return 0;
}

/** `node`, then the shadow host of each shadow root around it, innermost first. */
function hostChain(node: Node): Node[] {
  const chain = [node];
  let current = node;

  for (;;) {
    // Walked by parent rather than `getRootNode()`, which the server's DOM doesn't have.
    let root = current;

    while (root.parentNode !== null) {
      root = root.parentNode;
    }

    // A shadow root is the only document fragment with a host.
    if (root.nodeType !== DOCUMENT_FRAGMENT || !("host" in root)) {
      return chain;
    }

    current = (root as ShadowRoot).host;
    chain.push(current);
  }
}
