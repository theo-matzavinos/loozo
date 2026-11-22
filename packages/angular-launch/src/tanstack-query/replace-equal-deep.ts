/*! @license
 * Adapted from @tanstack/query-core 5.104.3 (src/utils.ts: isPlainArray, isPlainObject,
 * replaceEqualDeep), https://github.com/TanStack/query
 *
 * MIT License
 *
 * Copyright (c) 2021-present Tanner Linsley
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// query-core's `isPlainArray` and `isPlainObject` (5.104.3), which it doesn't export: the
// values whose keys `replaceEqualDeep` copies into a fresh array or object.
function isPlainArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length === Object.keys(value).length;
}

function hasObjectPrototype(value: unknown): boolean {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!hasObjectPrototype(value)) {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);
  const constructor: unknown = (prototype as { constructor?: unknown } | null)?.constructor;

  if (constructor === undefined) {
    return true;
  }

  if (typeof constructor !== "function") {
    return false;
  }

  const constructorPrototype: unknown = constructor.prototype;

  if (!hasObjectPrototype(constructorPrototype)) {
    return false;
  }

  if (!Object.hasOwn(constructorPrototype as object, "isPrototypeOf")) {
    return false;
  }

  return prototype === Object.prototype;
}

// query-core 5.104.3's `replaceEqualDeep`, with the same fast paths, depth limit and equality
// rules, reading `a[key]` and `b[key]` once each in the same order, except at a "__proto__" key.
// JSON.parse keeps that key as own data, but upstream copies keys by assignment, so the
// setter makes the value the copy's prototype and the key is lost (TanStack/query#12303,
// closed as not planned). Here the copy defines that key as an own data property, and the old
// side's value counts only if it's an own property of `a`, so the old object's prototype is
// never compared or reused.
export function replaceEqualDeep(a: unknown, b: unknown, depth = 0): unknown {
  if (a === b) {
    return a;
  }

  if (depth > 500) {
    return b;
  }

  const array = isPlainArray(a) && isPlainArray(b);

  if (!array && !(isPlainObject(a) && isPlainObject(b))) {
    return b;
  }

  // Both are plain arrays or both plain objects, so both are indexable.
  const previous = a as Record<PropertyKey, unknown>;
  const next = b as Record<PropertyKey, unknown>;
  let aItems: readonly unknown[];
  let bItems: readonly unknown[];
  let copy: Record<PropertyKey, unknown>;

  if (array) {
    aItems = a as unknown[];
    bItems = b as unknown[];
    // Upstream preallocates `new Array(bSize)`; the loop writes every index in order, so an
    // empty array ends up the same.
    copy = [] as unknown as Record<PropertyKey, unknown>;
  } else {
    aItems = Object.keys(previous);
    bItems = Object.keys(next);
    copy = {};
  }

  const aSize = aItems.length;
  const bSize = bItems.length;
  let equalItems = 0;

  for (let i = 0; i < bSize; i += 1) {
    let key: PropertyKey;

    if (array) {
      key = i;
    } else {
      key = bItems[i] as string;
    }

    const isProtoKey = key === "__proto__";
    let aItem: unknown;

    if (!isProtoKey || Object.hasOwn(previous, key)) {
      aItem = previous[key];
    }

    const bItem = next[key];
    let item: unknown;

    if (aItem === bItem) {
      item = aItem;

      // An equal value counts only where the old data has the item, not where both lack it.
      let inOld: boolean;

      if (array) {
        inOld = i < aSize;
      } else {
        inOld = Object.hasOwn(previous, key);
      }

      if (inOld) {
        equalItems += 1;
      }
    } else if (
      aItem === null ||
      bItem === null ||
      typeof aItem !== "object" ||
      typeof bItem !== "object"
    ) {
      item = bItem;
    } else {
      item = replaceEqualDeep(aItem, bItem, depth + 1);

      if (item === aItem) {
        equalItems += 1;
      }
    }

    if (isProtoKey) {
      Object.defineProperty(copy, key, {
        value: item,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    } else {
      copy[key] = item;
    }
  }

  if (aSize === bSize && equalItems === aSize) {
    return a;
  }

  return copy;
}
