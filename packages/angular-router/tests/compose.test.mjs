import assert from "node:assert/strict";
import test from "node:test";

await import("@angular/compiler");

const { DefaultUrlSerializer, PRIMARY_OUTLET } = await import("@angular/router");
const { compose } = await import("@loozo/angular-router/_generated");

const serializer = new DefaultUrlSerializer();
const parse = (url) => serializer.parse(url);
const href = (tree) => serializer.serialize(tree);
const open = (url) => ({ open: parse(url) });
const close = (outlet, ...anchor) => ({ close: { outlet, anchor } });
const word = (text) => ({ kind: "static", text });
const scalar = (name) => ({ kind: "scalar", name });

// Every group of a tree, root first.
function groups(tree) {
  const found = [];
  const pending = [tree.root];

  while (pending.length > 0) {
    const group = pending.shift();

    found.push(group);
    pending.push(...Object.values(group.children));
  }

  return found;
}

function composed(base, input) {
  const tree = parse(base);
  const before = href(tree);
  const result = compose(tree, input);

  // Pure: the base keeps its URL and shares no group, segment or parameter map with the result.
  assert.equal(href(tree), before);

  const baseGroups = groups(tree);
  const baseSegments = baseGroups.flatMap((group) => group.segments);

  for (const group of groups(result)) {
    assert.ok(!baseGroups.includes(group));

    for (const segment of group.segments) {
      assert.ok(!baseSegments.includes(segment));
      assert.ok(!baseSegments.some((other) => other.parameters === segment.parameters));
    }
  }

  assert.notEqual(result.queryParams, tree.queryParams);

  // What Angular reads back from the composed tree's own URL.
  assert.equal(href(parse(href(result))), href(result));

  return href(result);
}

const start = "/products/(list//detail:item/3)(chat:chat/7)?sort=price";

test("a primary URL keeps each named branch whose concrete anchor stays on the new path", () => {
  assert.equal(
    composed(start, open("/products/list?page=2")),
    "/products/(list//detail:item/3)(chat:chat/7)?page=2",
  );
  assert.equal(composed(start, open("/plain")), "/plain(chat:chat/7)");
  assert.equal(composed(start, open("/products")), "/products/(detail:item/3)(chat:chat/7)");
  assert.equal(composed("/products/list#top", open("/plain?x=1#end")), "/plain?x=1#end");

  // Concrete decoded segments decide: teams/4 isn't teams/5, and %34 is 4.
  const teams = "/teams/4/(list//detail:item/3)(chat:chat/7)?old=1#old";

  assert.equal(composed(teams, open("/teams/5/list")), "/teams/5/list(chat:chat/7)");
  assert.equal(
    composed(teams, open("/teams/%34/list?new=2#new")),
    "/teams/4/(list//detail:item/3)(chat:chat/7)?new=2#new",
  );
});

test("a branch URL on the current path opens or replaces its outlet and keeps the rest", () => {
  assert.equal(
    composed("/products/list", open("/products/(detail:item/3)")),
    "/products/(list//detail:item/3)",
  );
  assert.equal(
    composed(start, open("/products/(detail:item/4)")),
    "/products/(list//detail:item/4)(chat:chat/7)?sort=price",
  );
  assert.equal(
    composed(start, open("/(chat:chat/8)")),
    "/products/(list//detail:item/3)(chat:chat/8)?sort=price",
  );
  assert.equal(
    composed("/products/list?page=4#keep", open("/(chat:chat/7)")),
    "/products/list(chat:chat/7)?page=4#keep",
  );
  assert.equal(composed("/", open("/(chat:a/b)")), "/(chat:a/b)");
});

test("a branch URL off the current path takes its anchor as the primary path", () => {
  assert.equal(
    composed("/plain(chat:chat/7)?old=1#old", open("/products/(detail:item/3)")),
    "/products/(detail:item/3)(chat:chat/7)",
  );
  // The detail anchored at teams/4 doesn't survive against teams/5.
  assert.equal(
    composed("/teams/4/(list//detail:item/3)(chat:chat/7)", open("/teams/5/(detail:item/1)")),
    "/teams/5/(detail:item/1)(chat:chat/7)",
  );
});

test("close removes the outlet its anchor pattern matches, whatever it shows", () => {
  assert.equal(composed(start, close("chat")), "/products/(list//detail:item/3)?sort=price");
  assert.equal(
    composed(start, close("detail", word("products"))),
    "/products/list(chat:chat/7)?sort=price",
  );
  assert.equal(
    composed("/teams/4/(detail:item/3)?q=1#f", close("detail", word("teams"), scalar("teamId"))),
    "/teams/4?q=1#f",
  );
  assert.equal(composed("/plain(chat:unknown/path)?q=1#f", close("chat")), "/plain?q=1#f");
  assert.equal(
    composed("/products/list(chat:chat/7/settings)?page=4#keep", close("chat")),
    "/products/list?page=4#keep",
  );
});

test("a close with nothing to close returns a tree equal to the base", () => {
  for (const [base, input] of [
    ["/products/list?page=4#keep", close("chat")],
    ["/products/(list//detail:item/3)(chat:chat/7)", close("detail", word("teams"), scalar("id"))],
    ["/(chat:chat/7)", close("detail", word("products"))],
    ["/products/(list//detail:item/3)", close("detail", word("plain"))],
    ["/products/(list//detail:item/3)", close("chat", word("products"))],
  ]) {
    const tree = parse(base);
    const result = compose(tree, input);

    assert.equal(composed(base, input), base);
    assert.notEqual(result, tree);
  }
});

test("matrix params stay with the segments they were written on", () => {
  const matrix = "/products;view=grid/(list//detail:item/3;tab=specs)";

  // Opening or closing a branch keeps the base's primary matrix params.
  assert.equal(
    composed(matrix, open("/products/(detail:item/4)")),
    "/products;view=grid/(list//detail:item/4)",
  );
  assert.equal(composed(matrix, close("detail", word("products"))), "/products;view=grid/list");
  // A primary URL brings its own segments; kept branches keep theirs. The comparison
  // ignores matrix params, so only the base's `view=grid` doesn't stop retention.
  assert.equal(
    composed(matrix, open("/products/list")),
    "/products/(list//detail:item/3;tab=specs)",
  );
  assert.equal(
    composed("/products/(list//detail:item/3)", open("/products;view=list/list")),
    "/products;view=list/(list//detail:item/3)",
  );
});

test("hand-written named groups follow the same rules and keep their subtrees", () => {
  const nested = "/account/(profile//aside:help/(x:y))";

  assert.equal(
    composed(nested, open("/account/settings")),
    "/account/(settings//aside:help/(x:y))",
  );
  assert.equal(composed(nested, close("aside", word("account"))), "/account/profile");

  const tree = parse(nested);
  const result = compose(tree, open("/account/settings"));
  const aside = result.root.children[PRIMARY_OUTLET].children.aside;

  aside.segments[0].parameters.changed = "yes";
  assert.equal(href(tree), nested);
});
