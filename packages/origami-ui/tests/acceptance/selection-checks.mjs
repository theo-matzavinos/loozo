import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The package-private selection and focus rules in Node: the shared write rules and typeahead
// through the installed package's ɵ exports, and the Select's active-option model and the roving
// focus's targets, which no entry point exports, through their framework-free sources.
const consumer = createRequire(resolve(".scratch/consumer/package.json"));

async function load(specifier) {
  return import(pathToFileURL(consumer.resolve(specifier)).href);
}

await load("@angular/compiler");

const { signal } = await load("@angular/core");
const {
  ɵrequestSingleSelection,
  ɵrequestMultipleSelection,
  ɵmatchTypeahead: matchTypeahead,
  ɵTypeaheadBuffer: TypeaheadBuffer,
} = await load("@loozo/origami-ui/collection");
const { moveActiveOption } = await import(
  pathToFileURL(resolve("select/src/active-option.ts")).href
);
const { targetOf, searchable } = await import(
  pathToFileURL(resolve("collection/src/roving-targets.ts")).href
);
const { documentOrder } = await import(
  pathToFileURL(resolve("collection/src/document-order.ts")).href
);

/** Counts writes, so a request that matches the current state is seen to write nothing. */
function counted(initial) {
  const selection = signal(initial);
  let writes = 0;
  const set = selection.set.bind(selection);

  selection.set = (value) => {
    writes += 1;
    set(value);
  };

  return { selection, writes: () => writes };
}

// Single: string, number and boolean values, compared with ===.
{
  const numbers = counted(null);

  ɵrequestSingleSelection(numbers.selection, 2, true, false);
  assert.equal(numbers.selection(), 2);
  ɵrequestSingleSelection(numbers.selection, 2, true, false);
  assert.equal(numbers.writes(), 1, "Selecting the selected value writes nothing");
  ɵrequestSingleSelection(numbers.selection, "2", true, false);
  assert.equal(numbers.selection(), "2", '"2" is a different value from 2');
  ɵrequestSingleSelection(numbers.selection, 2, false, false);
  assert.equal(numbers.writes(), 2, "Clearing an unselected value writes nothing");

  const booleans = counted(null);

  ɵrequestSingleSelection(booleans.selection, false, true, false);
  assert.equal(booleans.selection(), false);
  ɵrequestSingleSelection(booleans.selection, false, false, false);
  assert.equal(booleans.selection(), false, "Not clearable: the selection stays");
  ɵrequestSingleSelection(booleans.selection, false, false, true);
  assert.equal(booleans.selection(), null, "Clearable: false clears to null, not to false");
  assert.equal(booleans.writes(), 2);
}

// Multiple: append and remove in new arrays, unknown entries kept in order, never mutating.
{
  const initial = Object.freeze([3, "3", 7]);
  const values = counted(initial);

  ɵrequestMultipleSelection(values.selection, 1, true);
  assert.deepEqual(values.selection(), [3, "3", 7, 1]);
  ɵrequestMultipleSelection(values.selection, 3, false);
  assert.deepEqual(values.selection(), ["3", 7, 1], 'Removing 3 keeps "3"');
  ɵrequestMultipleSelection(values.selection, 7, true);
  assert.equal(values.writes(), 2, "Adding a present value writes nothing");
  assert.deepEqual(initial, [3, "3", 7], "The caller's array is never mutated");
}

/** An option for the active-option model: a name and whether it's disabled. */
function option(name, disabled = false) {
  return { name, disabled: () => disabled };
}

// Moves over [a, b, c (disabled), d, e]: no wrapping, disabled skipped, ends clamp.
{
  const [a, b, c, d, e] = [option("a"), option("b"), option("c", true), option("d"), option("e")];
  const options = [a, b, c, d, e];

  assert.equal(
    moveActiveOption(options, null, "next"),
    a,
    "Forward without an active option: first",
  );
  assert.equal(moveActiveOption(options, null, "previous"), e, "Backward without one: last");
  assert.equal(moveActiveOption(options, null, "pageDown"), a);
  assert.equal(moveActiveOption(options, null, "pageUp"), e);
  assert.equal(moveActiveOption(options, b, "next"), d, "Skips the disabled option");
  assert.equal(moveActiveOption(options, d, "previous"), b);
  assert.equal(moveActiveOption(options, e, "next"), e, "No wrap at the end");
  assert.equal(moveActiveOption(options, a, "previous"), a, "No wrap at the start");
  assert.equal(moveActiveOption(options, d, "first"), a);
  assert.equal(moveActiveOption(options, b, "last"), e);
  // A disabled active option keeps its position.
  assert.equal(moveActiveOption(options, c, "next"), d);
  assert.equal(moveActiveOption(options, c, "previous"), b);
  assert.equal(moveActiveOption([c], null, "first"), null, "No enabled option: nothing");
  assert.equal(moveActiveOption([], null, "next"), null);
}

// Pages move ten enabled options and clamp.
{
  const options = [];

  for (let index = 0; index < 25; index++) {
    options.push(option(String(index), index === 5));
  }

  // Enabled: 0-4, 6-24 (24 options).
  assert.equal(moveActiveOption(options, options[0], "pageDown"), options[11]);
  assert.equal(moveActiveOption(options, options[11], "pageDown"), options[21]);
  assert.equal(moveActiveOption(options, options[21], "pageDown"), options[24], "Clamped");
  assert.equal(moveActiveOption(options, options[24], "pageUp"), options[14]);
  assert.equal(moveActiveOption(options, options[3], "pageUp"), options[0], "Clamped");
  assert.equal(
    moveActiveOption(options, options[5], "pageDown"),
    options[15],
    "From a disabled one",
  );
}

// Typeahead: prefix match from the active option, cycling one repeated character.
{
  const names = ["Apple", "Apricot", "Banana", "Blueberry", "Navel orange", "Ñandú"];
  const candidates = names.map((name) => option(name));
  const text = (candidate) => candidate.name;
  const [apple, apricot, banana, blueberry, navel, nandu] = candidates;

  assert.equal(matchTypeahead(candidates, null, "b", text), banana, "From the start without one");
  assert.equal(matchTypeahead(candidates, banana, "b", text), blueberry, "One character: after it");
  assert.equal(
    matchTypeahead(candidates, blueberry, "bb", text),
    banana,
    "Repeated: cycles, wrapping",
  );
  assert.equal(
    matchTypeahead(candidates, apple, "ap", text),
    apple,
    "Several: from the active one",
  );
  assert.equal(matchTypeahead(candidates, apple, "apr", text), apricot);
  assert.equal(matchTypeahead(candidates, apple, "AP", text), apple, "Case-insensitive");
  assert.equal(matchTypeahead(candidates, null, "navel o", text), navel, "Spaces are characters");
  assert.equal(matchTypeahead(candidates, null, "ñ", text), nandu);
  assert.equal(matchTypeahead(candidates, apple, "x", text), null, "No match: null");
  assert.equal(matchTypeahead(candidates, apple, "a", text), apricot);
  assert.equal(
    matchTypeahead([apple], apple, "a", text),
    apple,
    "The only match is the active one",
  );
}

// The buffer runs for 500 ms after its last character.
{
  const buffer = new TypeaheadBuffer();

  assert.equal(buffer.running(0), false, "Empty: not running");
  assert.equal(buffer.add("n", 1000), "n");
  assert.equal(buffer.running(1500), true);
  assert.equal(buffer.add(" ", 1500), "n ");
  assert.equal(buffer.add("o", 2000), "n o", "500 ms after the last character it still runs");
  assert.equal(buffer.running(2501), false);
  assert.equal(buffer.add("b", 2501), "b", "A new search starts");
  buffer.reset();
  assert.equal(buffer.running(2502), false);
}

/**
 * A roving member for the targets model: a name, its disabled state and focusability, and its
 * typeahead text, or none.
 */
function member(name, { disabled = false, focusable = false, label = name } = {}) {
  let text = null;

  if (label !== null) {
    text = () => label;
  }

  return { name, disabled: () => disabled, focusable: () => focusable, label: text };
}

// Roving edge entry over [Archive (disabled, focusable), Copy, Delete (disabled), Edit,
// Share (disabled, focusable)]: a focusable disabled member is an edge, a natively disabled one
// isn't.
{
  const archive = member("Archive", { disabled: true, focusable: true });
  const copy = member("Copy");
  const remove = member("Delete", { disabled: true });
  const edit = member("Edit");
  const share = member("Share", { disabled: true, focusable: true });
  const members = [archive, copy, remove, edit, share];

  assert.equal(targetOf(members, null, "first"), archive, "First: a focusable disabled member");
  assert.equal(targetOf(members, null, "last"), share);
  assert.equal(targetOf([remove, copy, remove], null, "first"), copy, "Skips natively disabled");
  assert.equal(targetOf([remove, copy, remove], null, "last"), copy);
  assert.equal(targetOf([remove], null, "first"), null, "No member can take focus: none");
  assert.equal(targetOf([], null, "last"), null);
  assert.equal(targetOf(members, null, "next"), null, "Next and previous need a current member");
  assert.equal(targetOf(members, edit, "next"), share);
  assert.equal(targetOf(members, share, "next"), archive, "Wraps");
  assert.equal(targetOf(members, copy, "previous"), archive);
  assert.equal(targetOf(members, edit, "previous"), copy, "Skips the natively disabled member");
}

// Roving search: focusable members with a label, a focusable disabled one included, cycling.
{
  const save = member("Save", { disabled: true, focusable: true });
  const share = member("Share");
  const skip = member("Skip", { disabled: true });
  const settings = member("Gear", { label: "Settings" });
  const silent = member("Silent", { label: null });
  const members = [save, share, skip, settings, silent];
  const candidates = searchable(members);
  const text = (candidate) => candidate.label();

  assert.deepEqual(candidates, [save, share, settings], "Labelled members that can take focus");
  assert.equal(matchTypeahead(candidates, null, "s", text), save, "A disabled item is found");
  assert.equal(matchTypeahead(candidates, save, "s", text), share, "One character: after it");
  assert.equal(matchTypeahead(candidates, share, "ss", text), settings, "Repeated: cycles");
  assert.equal(matchTypeahead(candidates, settings, "sss", text), save, "Wrapping");
  assert.equal(matchTypeahead(candidates, share, "set", text), settings, "The label, not the name");
  assert.equal(matchTypeahead(candidates, null, "gear", text), null, "A label replaces the text");
  assert.equal(
    matchTypeahead(candidates, skip, "s", text),
    save,
    "From a non-candidate: the first",
  );
}

/**
 * A node for the order comparator, which reads only `parentNode`, `nodeType`, a shadow root's
 * `host` and `compareDocumentPosition`, here as DOM specifies it: tree order within one root,
 * and disconnected, with an arbitrary but consistent direction, across two roots, as for a light
 * element and one in a shadow root of the same document.
 */
class TreeNode {
  children = [];

  constructor(name, parent = null, { nodeType = 1, host } = {}) {
    this.name = name;
    this.parentNode = parent;
    this.nodeType = nodeType;

    if (host !== undefined) {
      this.host = host;
    }

    if (parent !== null) {
      parent.children.push(this);
    }
  }

  get root() {
    let root = this;

    while (root.parentNode !== null) {
      root = root.parentNode;
    }

    return root;
  }

  contains(other) {
    for (let node = other; node !== null; node = node.parentNode) {
      if (node === this) {
        return true;
      }
    }

    return false;
  }

  compareDocumentPosition(other) {
    if (other === this) {
      return 0;
    }

    if (other.root !== this.root) {
      return 1 | 32 | 2;
    }

    const order = [];
    const walk = (node) => {
      order.push(node);

      for (const child of node.children) {
        walk(child);
      }
    };

    walk(this.root);

    if (order.indexOf(other) < order.indexOf(this)) {
      if (other.contains(this)) {
        return 2 | 8;
      }

      return 2;
    }

    if (this.contains(other)) {
      return 4 | 16;
    }

    return 4;
  }
}

/** Attaches a shadow root to `host`. */
function shadow(host) {
  return new TreeNode(`${host.name}#shadow`, null, { nodeType: 11, host });
}

// Document order across open shadow roots: an element in a shadow root sorts at its host, after
// it and before the host's light children; a nested shadow root at its own host; elements with
// no common tree compare equal.
{
  const document = new TreeNode("#document", null, { nodeType: 9 });
  const content = new TreeNode("content", document);
  const zero = new TreeNode("zero", content);
  const host = new TreeNode("host", content);
  const slotted = new TreeNode("slotted", host);
  const tail = new TreeNode("tail", content);
  const root = shadow(host);
  const alpha = new TreeNode("alpha", root);
  const inner = new TreeNode("inner", root);
  const bravo = new TreeNode("bravo", root);
  const deep = new TreeNode("deep", shadow(inner));
  const detached = new TreeNode("detached");
  const fragment = new TreeNode("#fragment", null, { nodeType: 11 });
  const loose = new TreeNode("loose", fragment);
  const names = (nodes) => {
    const sorted = [...nodes].sort(documentOrder);
    const result = [];

    for (const node of sorted) {
      result.push(node.name);
    }

    return result;
  };

  assert.deepEqual(
    names([tail, bravo, alpha, zero, deep, slotted, host]),
    ["zero", "host", "alpha", "deep", "bravo", "slotted", "tail"],
    "Shadow members sort at their hosts, a nested root at its own",
  );
  assert.deepEqual(names([alpha, bravo, zero]), ["zero", "alpha", "bravo"], "A light item before");
  assert.equal(documentOrder(zero, tail), -1, "Same root: tree order");
  assert.equal(documentOrder(tail, zero), 1);
  assert.equal(documentOrder(host, alpha), -1, "A host before its shadow tree");
  assert.equal(documentOrder(alpha, host), 1);
  assert.equal(documentOrder(alpha, slotted), -1, "A shadow tree before its host's children");
  assert.equal(documentOrder(deep, alpha), 1, "A nested root after what precedes its host");
  assert.equal(documentOrder(deep, bravo), -1);
  assert.equal(documentOrder(alpha, detached), 0, "No common tree: equal");
  assert.equal(documentOrder(detached, zero), 0);
  assert.equal(documentOrder(loose, alpha), 0, "A fragment without a host: no common tree");
}

console.log(
  "Selection and focus rules: generic single and multiple writes compare with ===; the Select's active-option moves; typeahead and its buffer; roving edge entry and search candidates; document order across shadow roots.",
);
