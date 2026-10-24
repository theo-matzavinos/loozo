import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The package-private selection rules in Node: the shared write rules through the installed
// package's ɵ exports, and the Select's active-option model, which no entry point exports, through
// its framework-free source.
const consumer = createRequire(resolve(".scratch/consumer/package.json"));

async function load(specifier) {
  return import(pathToFileURL(consumer.resolve(specifier)).href);
}

await load("@angular/compiler");

const { signal } = await load("@angular/core");
const { ɵrequestSingleSelection, ɵrequestMultipleSelection } = await load(
  "@loozo/origami-ui/collection",
);
const { moveActiveOption, matchTypeahead, TypeaheadBuffer } = await import(
  pathToFileURL(resolve("select/src/active-option.ts")).href
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

console.log(
  "Selection rules: generic single and multiple writes compare with ===; the Select's active-option moves, typeahead and buffer.",
);
