/**
 * Typeahead: what a typed search matches and how long its buffer runs. Pure and framework-free,
 * shared by Select (over its enabled options) and the roving focus's `search` (over the members
 * that can take focus). Package-private.
 */

/** How long a typeahead buffer keeps running after its last character, in milliseconds. */
const typeaheadTimeout = 500;

/**
 * @internal Package-private typeahead match for Origami's composite widgets; not an application
 * API.
 *
 * The first candidate whose text starts with the search, case-insensitively, in DOM order from the
 * active candidate, wrapping. A single character, or one character repeated, starts after the
 * active candidate, so repeating a character cycles through the candidates it starts.
 * @param candidates - The searchable candidates in DOM order.
 * @param active - The current candidate, or null to search from the first one. One that isn't a
 *   candidate also searches from the first.
 * @param search - The typeahead buffer.
 * @param text - Reads a candidate's typeahead text.
 * @returns The match, or null.
 */
export function ɵmatchTypeahead<C>(
  candidates: readonly C[],
  active: C | null,
  search: string,
  text: (candidate: C) => string,
): C | null {
  // One code point repeated, such as "bbb", searches for that character.
  const repeated = /^(.)\1+$/su.exec(search);
  let query = search.toLocaleLowerCase();

  if (repeated !== null) {
    query = repeated[1].toLocaleLowerCase();
  }

  const count = candidates.length;
  let position = -1;
  let start = 0;

  if (active !== null) {
    position = candidates.indexOf(active);
  }

  if (position !== -1) {
    start = position;

    if (/^.$/su.test(query)) {
      start = position + 1;
    }
  }

  for (let step = 0; step < count; step++) {
    const candidate = candidates[(start + step) % count];

    if (text(candidate).toLocaleLowerCase().startsWith(query)) {
      return candidate;
    }
  }

  return null;
}

/**
 * @internal Package-private typeahead buffer for Origami's composite widgets; not an application
 * API. It collects characters typed within 500 ms of each other.
 */
export class ɵTypeaheadBuffer {
  #buffer = "";
  #time = 0;

  /** Whether a buffer typed before `time` still runs, so a Space joins it instead of activating. */
  running(time: number): boolean {
    return this.#buffer !== "" && time - this.#time <= typeaheadTimeout;
  }

  /**
   * Adds a character typed at `time`, starting a new buffer when the last one stopped running.
   * @returns The buffer.
   */
  add(character: string, time: number): string {
    if (!this.running(time)) {
      this.#buffer = "";
    }

    this.#buffer += character;
    this.#time = time;

    return this.#buffer;
  }

  /** Ends the running buffer: the next character starts a new search. */
  reset(): void {
    this.#buffer = "";
  }
}
