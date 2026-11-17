import "@angular/compiler";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readCookies } from "../dist/server/index.js";

function cookiesOf(cookie) {
  return readCookies(new Request("http://test/", { headers: { cookie } }));
}

test("reads each cookie by name as sent, without decoding, and a missing name as undefined", () => {
  const cookies = cookiesOf('proof-user=alice; proof-delay=1; n=J%C3%BCrgen; q="quoted"; t=abc==');

  assert.deepEqual(
    [...cookies],
    [
      ["proof-user", "alice"],
      ["proof-delay", "1"],
      ["n", "J%C3%BCrgen"],
      ["q", '"quoted"'],
      ["t", "abc=="],
    ],
  );
  assert.equal(cookies.get("absent"), undefined);
});

test("a request without a Cookie header, or with an empty one, reads no cookies", () => {
  assert.equal(readCookies(new Request("http://test/")).size, 0);
  assert.equal(cookiesOf("").size, 0);
  assert.equal(cookiesOf(";;; ;").size, 0);
});

test("a repeated name reads as its first occurrence in the header", () => {
  assert.equal(cookiesOf("session=first; session=second").get("session"), "first");
});

test("skips pairs without a name and trims spaces and tabs around names and values", () => {
  assert.deepEqual(
    [...cookiesOf("flag; =orphan; a =  1 ;\tb\t=\t2; e=")],
    [
      ["a", "1"],
      ["b", "2"],
      ["e", ""],
    ],
  );
});

test("doesn't trim a no-break space, so it can't make a name read as __Host-", () => {
  const cookies = cookiesOf("\u00a0__Host-s=evil; __Host-s=real");

  assert.equal(cookies.get("__Host-s"), "real");
  assert.equal(cookies.get("\u00a0__Host-s"), "evil");
});

test("only semicolons separate pairs, so a value can't carry another cookie", () => {
  assert.deepEqual(
    [...cookiesOf("x=foo,session=evil; session=real")],
    [
      ["x", "foo,session=evil"],
      ["session", "real"],
    ],
  );
  assert.deepEqual(
    [...cookiesOf('a="x; session=evil"; session=real')],
    [
      ["a", '"x'],
      ["session", 'evil"'],
    ],
  );
});

test("names such as __proto__ and toString are ordinary cookies", () => {
  const cookies = cookiesOf("__proto__=p; constructor=c; toString=t; hasOwnProperty=h");

  assert.equal(cookies.get("__proto__"), "p");
  assert.equal(cookies.get("constructor"), "c");
  assert.equal(cookies.get("toString"), "t");
  assert.equal(cookies.get("hasOwnProperty"), "h");
  assert.equal(cookies.get("valueOf"), undefined);
});

test("two Cookie fields joined by Headers read as separate cookies", () => {
  const headers = new Headers();

  headers.append("cookie", "a=1");
  headers.append("cookie", "b=2");

  assert.deepEqual(
    [...readCookies(new Request("http://test/", { headers }))],
    [
      ["a", "1"],
      ["b", "2"],
    ],
  );
});
