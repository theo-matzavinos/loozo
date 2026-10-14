import assert from "node:assert/strict";
import {
  appendFile,
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildContent } from "../src/content.ts";
import { writeContent } from "../src/emit.ts";
import { renderPublishedReadme } from "../src/readme.ts";

const tool = fileURLToPath(new URL("..", import.meta.url));
const fixture = join(tool, "tests/fixtures/repo");
const commit = "0123456789abcdef0123456789abcdef01234567";
const blob = `https://github.com/theo-matzavinos/loozo/blob/${commit}`;
const temporary = [];

let widgets;
let notes;

before(async () => {
  const contents = await buildContent({ root: fixture, commit });

  notes = contents[0];
  widgets = contents[1];
});

after(async () => {
  for (const dir of temporary) {
    await rm(dir, { recursive: true, force: true });
  }
});

/** Copies the fixture repository so a test can break it; dependencies resolve from this tool. */
async function brokenFixture(change) {
  const root = await mkdtemp(join(tmpdir(), "docs-content-"));

  temporary.push(root);
  await cp(fixture, root, { recursive: true });
  await symlink(join(tool, "node_modules"), join(root, "node_modules"));
  await change(root);

  return root;
}

function text(html) {
  return html
    .replace(/<[^>]+>/g, "")
    .replaceAll("&lt;", "<")
    .replaceAll("&#x3C;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
}

function symbol(content, name) {
  for (const entryPoint of content.entryPoints) {
    for (const apiSymbol of entryPoint.symbols) {
      if (apiSymbol.name === name) {
        return apiSymbol;
      }
    }
  }

  return undefined;
}

test("orders packages by slug and copies package.json listing data", () => {
  assert.equal(notes.slug, "notes");
  assert.equal(widgets.name, "@fixture/widgets");
  assert.equal(widgets.version, "1.2.3");
  assert.equal(widgets.description, "Fixture widgets.");
});

test("splits the README into an overview and one guide per H2", () => {
  assert.doesNotMatch(widgets.overviewHtml, /<h1/);
  assert.match(widgets.overviewHtml, /^<p>Widgets overview/);

  const slugs = [];

  for (const guide of widgets.guides) {
    slugs.push(`${guide.slug}:${guide.title}`);
  }

  assert.deepEqual(slugs, ["setup:Setup", "snippets:Snippets", "setup-1:Setup"]);

  const setup = widgets.guides[0];

  assert.doesNotMatch(setup.html, /<h2/);
  assert.match(setup.html, /<h3 id="details">Details<\/h3>/);
  assert.match(setup.html, /<h4 id="deep-heading">Deep <code>heading<\/code><\/h4>/);
  assert.deepEqual(setup.headings, [
    { id: "details", text: "Details", level: 3 },
    { id: "deep-heading", text: "Deep heading", level: 4 },
  ]);
});

test("links to other packages' READMEs resolve to their docs pages and headings", () => {
  assert.match(notes.overviewHtml, /<a href="widgets\/guide\/setup" data-docs-link="">/);
  assert.match(notes.overviewHtml, /<a href="widgets\/guide\/setup#details" data-docs-link="">/);
  assert.match(notes.overviewHtml, /<a href="widgets" data-docs-link="">widgets<\/a>/);
  assert.match(widgets.guides[0].html, /<a href="notes\/guide\/usage-tips" data-docs-link="">/);
});

test("same-README anchors resolve to the guide page and heading that contain them", () => {
  assert.match(
    widgets.overviewHtml,
    /<a href="widgets\/guide\/setup" data-docs-link="">the setup guide/,
  );
  assert.match(
    widgets.guides[0].html,
    /<a href="widgets\/guide\/setup#details" data-docs-link="">details/,
  );
});

test("other repository links become GitHub URLs pinned to the commit", () => {
  const html = widgets.guides[0].html;

  assert.match(html, new RegExp(`href="${blob}/packages/widgets/SPEC.md"`));
  assert.match(html, new RegExp(`href="${blob.replace("/blob/", "/tree/")}/docs"`));
  assert.match(html, new RegExp(`href="${blob}/docs/notes.md#top"`));
  assert.match(html, /<a href="https:\/\/example.com">external<\/a>/);
});

test("inline code naming a symbol of the same package links to its API page", () => {
  assert.match(
    widgets.overviewHtml,
    /<a href="widgets\/api\/toggle-label" data-docs-link=""><code>toggleLabel<\/code><\/a>/,
  );
  // Generated-API symbols link to their anchor on the generated-API page.
  assert.match(
    widgets.overviewHtml,
    /and <a href="widgets\/generated-api#internal-handle" data-docs-link=""><code>InternalHandle<\/code><\/a>/,
  );
  // Other packages' symbols stay plain code.
  assert.match(notes.guides[0].html, /; <code>Toggle<\/code> belongs/);
  assert.match(
    notes.guides[0].html,
    /<a href="notes\/api\/note-title" data-docs-link=""><code>noteTitle/,
  );
  // Code that is already a link keeps its own target.
  assert.match(
    widgets.guides[0].html,
    /Linked code <a href="widgets\/guide\/setup" data-docs-link=""><code>Toggle<\/code><\/a>/,
  );
});

test("TSDoc {@link} resolves like inline code and renders unresolvable targets as code", () => {
  const toggle = symbol(widgets, "Toggle");

  assert.match(
    toggle.descriptionHtml,
    /<a href="widgets\/api\/toggle-label" data-docs-link=""><code>toggleLabel<\/code><\/a>; <code>Missing<\/code>/,
  );
  assert.match(symbol(widgets, "toggleLabel").summaryHtml, /<a href="widgets\/api\/toggle"/);
});

test("TSDoc {@link Name | label} resolves when the label contains inline code", () => {
  const html = symbol(widgets, "ToggleError").descriptionHtml;

  assert.equal(
    html,
    '<p>Thrown by <a href="widgets/api/toggle" data-docs-link="">the <code>Toggle</code> directive</a>; ' +
      "<code>Missing</code> is not a symbol.</p>\n",
  );
});

test("embeds snippets with captions, regions, dedent and source links", () => {
  const html = widgets.guides[1].html;
  const figures = html.split("</figure>");

  assert.equal(figures.length, 4);
  assert.match(figures[0], /<figcaption><code>snippets\/example.ts<\/code>/);
  assert.match(figures[0], new RegExp(`href="${blob}/packages/widgets/snippets/example.ts"`));
  assert.match(figures[0], /<pre class="shiki shiki-themes github-light github-dark"/);
  assert.match(figures[0], /--shiki-dark:/);
  assert.doesNotMatch(figures[0], /#region|#endregion/);
  assert.equal(
    text(figures[0].slice(figures[0].indexOf("<pre"))),
    'import type { Toggle } from "../src/index.js";\n\nexport function main(toggle: Toggle): void {\n' +
      "  if (toggle.checked()) {\n    toggle.toggle();\n  }\n}",
  );

  assert.match(figures[1], new RegExp(`href="${blob}/packages/widgets/snippets/example.ts#L5-L7"`));
  assert.equal(
    text(figures[1].slice(figures[1].indexOf("<pre"))),
    "if (toggle.checked()) {\n  toggle.toggle();\n}",
  );

  assert.match(figures[2], /<code>snippets\/page.html<\/code>/);
  assert.equal(
    text(figures[2].slice(figures[2].indexOf("<pre"))),
    '<section class="card">\n  <button fxToggle>Card</button>\n</section>',
  );
});

const embedFailures = [
  [
    "a missing snippet file",
    "[](snippets/missing.ts)",
    /README\.md:20: snippet file not found: snippets\/missing\.ts/,
  ],
  [
    "a missing region",
    "[](snippets/example.ts#nope)",
    /README\.md:20: region "nope" not found in snippets\/example\.ts/,
  ],
  [
    "an unknown view",
    '[](snippets/example.ts "sideways")',
    /README\.md:20: unknown snippet view "sideways"/,
  ],
  [
    "a reserved view",
    '[](snippets/example.ts "playground")',
    /README\.md:20: snippet view "playground" is not supported yet/,
  ],
  [
    "code outside snippets/",
    "[](src/index.ts)",
    /README\.md:20: a paragraph-only link to code must point into this package's snippets\/ directory/,
  ],
];

for (const [name, embed, message] of embedFailures) {
  test(`fails the content step on ${name}`, async () => {
    const root = await brokenFixture(async (dir) => {
      const readme = join(dir, "packages/widgets/README.md");
      const source = await readFile(readme, "utf8");

      await writeFile(readme, source.replace("[](snippets/example.ts)", embed));
    });

    await assert.rejects(buildContent({ root, commit }), message);
  });
}

test("fails the content step on a snippet symlink that leaves the package", async () => {
  const root = await brokenFixture(async (dir) => {
    const readme = join(dir, "packages/widgets/README.md");
    const source = await readFile(readme, "utf8");

    await writeFile(join(dir, "outside.ts"), "export const outside = 1;\n");
    await symlink(join(dir, "outside.ts"), join(dir, "packages/widgets/snippets/escape.ts"));
    await writeFile(readme, source.replace("[](snippets/example.ts)", "[](snippets/escape.ts)"));
  });

  await assert.rejects(
    buildContent({ root, commit }),
    /README\.md:20: snippet resolves outside this package's snippets\/ directory: snippets\/escape\.ts/,
  );
});

/** Copies the fixture with one snippet file and a README that only embeds it. */
async function snippetFixture(name, code, embed) {
  return brokenFixture(async (dir) => {
    await writeFile(join(dir, "packages/widgets/snippets", name), code);
    await writeFile(join(dir, "packages/widgets/README.md"), `# Widgets\n\n${embed}\n`);
  });
}

test("fails on a region that is opened again before it ends", async () => {
  const root = await snippetFixture(
    "nested.ts",
    [
      "// #region sample",
      "outer1();",
      "// #region sample",
      "inner();",
      "// #endregion sample",
      "outer2();",
      "// #endregion sample",
    ].join("\n"),
    "[](snippets/nested.ts#sample)",
  );

  assert.throws(
    () => renderPublishedReadme(join(root, "packages/widgets")),
    /README\.md:3: region "sample" is opened again before it ends in snippets\/nested\.ts/,
  );
});

test("dedents by the shared whitespace prefix, keeping mixed tabs and spaces relative", async () => {
  const root = await snippetFixture(
    "mixed.ts",
    "\t\tconst a = 1;\n\t    const b = 2;\n",
    "[](snippets/mixed.ts)",
  );
  const published = renderPublishedReadme(join(root, "packages/widgets"));

  assert.match(published, /```ts\n\tconst a = 1;\n    const b = 2;\n```/);
});

test("encodes repository paths in GitHub URLs", async () => {
  const root = await brokenFixture(async (dir) => {
    const readme = join(dir, "packages/widgets/README.md");
    const source = await readFile(readme, "utf8");

    await writeFile(join(dir, "packages/widgets/snippets/a#b.ts"), "export const a = 1;\n");
    await writeFile(readme, source.replace("[](snippets/example.ts)", "[](snippets/a%23b.ts)"));
    await writeFile(
      join(dir, "packages/widgets/src/a#b.ts"),
      "/** Declared in a file whose name holds a URL delimiter. */\nexport const special = 1;\n",
    );
    await appendFile(
      join(dir, "packages/widgets/src/index.ts"),
      '\nexport { special } from "./a#b.js";\n',
    );
  });
  const contents = await buildContent({ root, commit });

  assert.match(
    contents[1].guides[1].html,
    new RegExp(`href="${blob}/packages/widgets/snippets/a%23b\\.ts"`),
  );
  assert.equal(
    symbol(contents[1], "special").sourceUrl,
    `${blob}/packages/widgets/src/a%23b.ts#L2-L2`,
  );
});

test("fails on relative links in raw HTML and keeps absolute ones", async () => {
  assert.match(widgets.overviewHtml, /<a href="https:\/\/example.com\/raw">absolutely<\/a>/);

  const root = await brokenFixture(async (dir) => {
    const readme = join(dir, "packages/widgets/README.md");
    const source = await readFile(readme, "utf8");

    await writeFile(readme, source.replace("https://example.com/raw", "SPEC.md"));
  });

  await assert.rejects(
    buildContent({ root, commit }),
    /README\.md:4: relative links in raw HTML are not supported, use a Markdown link: SPEC\.md/,
  );
});

test("renders the published README with snippet embeds replaced by fenced code", () => {
  const published = renderPublishedReadme(join(fixture, "packages/widgets"));

  assert.match(published, /^# @fixture\/widgets\n/);
  assert.match(published, /\[the spec\]\(SPEC\.md\)/);
  const snippets = published.slice(
    published.indexOf("## Snippets"),
    published.lastIndexOf("## Setup"),
  );

  assert.equal(
    snippets,
    [
      "## Snippets",
      "",
      "`snippets/example.ts`",
      "",
      "```ts",
      'import type { Toggle } from "../src/index.js";',
      "",
      "export function main(toggle: Toggle): void {",
      "  if (toggle.checked()) {",
      "    toggle.toggle();",
      "  }",
      "}",
      "```",
      "",
      "`snippets/example.ts`",
      "",
      "```ts",
      "if (toggle.checked()) {",
      "  toggle.toggle();",
      "}",
      "```",
      "",
      "`snippets/page.html`",
      "",
      "```html",
      '<section class="card">',
      "  <button fxToggle>Card</button>",
      "</section>",
      "```",
      "",
      "",
    ].join("\n"),
  );
  assert.doesNotMatch(published, /#region|\]\(snippets\//);
});

test("extracts directive metadata and Angular input and output names", () => {
  const toggle = symbol(widgets, "Toggle");
  const members = {};

  assert.equal(toggle.kind, "directive");
  assert.deepEqual(toggle.angular, { selector: "[fxToggle]", exportAs: ["fxToggle"] });

  for (const member of toggle.members) {
    members[member.name] = [member.kind, member.input, member.output];
  }

  assert.deepEqual(members, {
    checked: ["property", "checked", "checkedChange"],
    label: ["property", "fxToggleLabel", null],
    changed: ["property", null, "toggled"],
    toggle: ["method", null, null],
  });
  assert.equal(symbol(widgets, "ToggleState").angular, null);
});

test("extracts descriptions, params, returns, throws, examples, deprecation and overloads", () => {
  const label = symbol(widgets, "toggleLabel");

  assert.equal(label.kind, "function");
  assert.equal(label.slug, "toggle-label");
  assert.equal(label.importPath, "@fixture/widgets");
  assert.match(label.descriptionHtml, /<p>Second paragraph of the description.<\/p>/);
  assert.doesNotMatch(label.summaryHtml, /Second paragraph/);
  assert.equal(label.signatures.length, 1);

  const [signature] = label.signatures;

  assert.deepEqual(
    signature.params.map((param) => [
      param.name,
      param.type,
      param.optional,
      param.descriptionHtml,
    ]),
    [
      ["text", "string", false, "<p>The visible text.</p>\n"],
      ["size", "ToggleSize | undefined", true, "<p>Optional size.</p>\n"],
    ],
  );
  // The only signature carries the symbol's own docs, so it has no description of its own.
  assert.equal(signature.descriptionHtml, "");
  assert.equal(signature.returnsHtml, "<p>The formatted label.</p>\n");
  assert.deepEqual(signature.throwsHtml, ["<p>RangeError when <code>text</code> is empty.</p>\n"]);
  assert.equal(text(signature.html).startsWith("function toggleLabel(text: string"), true);
  assert.deepEqual(label.typeParams, []);
  assert.equal(text(label.examplesHtml[0]), 'toggleLabel("On");');
  assert.match(label.deprecatedHtml, /labels directly/);
  assert.equal(label.sourceUrl, `${blob}/packages/widgets/src/index.ts#L71-L77`);

  const value = symbol(widgets, "toggleValue");
  const overloads = [];

  for (const overload of value.signatures) {
    overloads.push([text(overload.html), overload.params[0].type]);
  }

  assert.deepEqual(overloads, [
    ["function toggleValue(value: string): boolean", "string"],
    ["function toggleValue(value: boolean): string", "boolean"],
  ]);

  // Every non-function kind has exactly one declaration signature without params.
  for (const name of ["DEFAULT_LABEL", "ToggleSize", "ToggleState", "Toggle"]) {
    const declaration = symbol(widgets, name);

    assert.equal(declaration.signatures.length, 1, name);
    assert.deepEqual(declaration.signatures[0].params, [], name);
  }

  assert.equal(
    text(symbol(widgets, "DEFAULT_LABEL").signatures[0].html),
    "const DEFAULT_LABEL: string",
  );
  assert.equal(symbol(widgets, "DEFAULT_LABEL").slug, "default-label");
  assert.equal(symbol(widgets, "ToggleSize").kind, "type-alias");
  assert.equal(symbol(notes, "noteTitle").summaryHtml, "<p>Returns the title of a note.</p>\n");
});

test("groups method overloads into one member with per-overload docs, and lists type params", () => {
  const group = symbol(widgets, "ToggleGroup");

  assert.deepEqual(group.typeParams, [
    { name: "Value", descriptionHtml: "<p>The value each toggle stands for.</p>\n" },
    { name: "Key", descriptionHtml: "" },
  ]);
  assert.deepEqual(
    group.members.map((member) => member.name),
    ["select", "values"],
  );

  const [select, values] = group.members;
  const overloads = [];

  for (const signature of select.signatures) {
    overloads.push([
      text(signature.html),
      text(signature.descriptionHtml),
      signature.params.map((param) => [param.name, text(param.descriptionHtml)]),
      text(signature.returnsHtml),
    ]);
  }

  assert.equal(select.kind, "method");
  assert.equal(select.descriptionHtml, "<p>Selects by key.</p>\n");
  assert.deepEqual(overloads, [
    ["select(key: Key): boolean", "", [["key", "The toggle's key.\n"]], "Whether it was found.\n"],
    [
      "select(value: Value): boolean",
      "Selects by value.\n",
      [["value", "The toggle's value.\n"]],
      "Whether the value was found.\n",
    ],
  ]);
  assert.equal(values.signatures.length, 1);
  assert.equal(text(values.signatures[0].html), "readonly values: readonly Value[]");
});

/** Each signature's text with its params, returns and throws, as plain text. */
function signatureDocs(signatures) {
  const docs = [];

  for (const signature of signatures) {
    docs.push([
      text(signature.html),
      signature.params.map((param) => [param.name, text(param.descriptionHtml)]),
      text(signature.returnsHtml),
      signature.throwsHtml.map((throws) => text(throws)),
    ]);
  }

  return docs;
}

test("undocumented overloads share only implementation docs, never another overload's", () => {
  const documented = [
    [["value", "Decimal digits.\n"]],
    "An integer.\n",
    ["RangeError if out of range.\n"],
  ];

  assert.deepEqual(signatureDocs(symbol(widgets, "ToggleParser").members[0].signatures), [
    ["parse(value: string): number", ...documented],
    ["parse(value: boolean): string", [["value", ""]], "", []],
  ]);
  assert.deepEqual(signatureDocs(symbol(widgets, "parseToggle").signatures), [
    ["function parseToggle(value: string): number", ...documented],
    ["function parseToggle(value: boolean): string", [["value", ""]], "", []],
  ]);
  assert.deepEqual(signatureDocs(symbol(widgets, "countToggles").signatures), [
    [
      "function countToggles(toggles: string): number",
      [["toggles", "Toggle names.\n"]],
      "How many there are.\n",
      [],
    ],
    [
      "function countToggles(toggles: readonly string[]): number",
      [["toggles", "Toggle names.\n"]],
      "How many there are.\n",
      [],
    ],
  ]);
});

test("declarations without a body never share an overload's docs", () => {
  const documented = [
    [["value", "Decimal digits.\n"]],
    "An integer.\n",
    ["RangeError if out of range.\n"],
  ];
  const undocumented = [[["value", ""]], "", []];

  assert.deepEqual(signatureDocs(symbol(widgets, "parseAmbientToggle").signatures), [
    ["function parseAmbientToggle(value: string): number", ...documented],
    ["function parseAmbientToggle(value: boolean): string", ...undocumented],
  ]);
  assert.deepEqual(signatureDocs(symbol(widgets, "AmbientToggleParser").members[0].signatures), [
    ["parse(value: boolean): string", ...undocumented],
    ["parse(value: string): number", ...documented],
  ]);
  assert.deepEqual(signatureDocs(symbol(widgets, "AbstractToggleParser").members[0].signatures), [
    ["parse(value: boolean): string", ...undocumented],
    ["parse(value: string): number", ...documented],
  ]);
  assert.deepEqual(
    signatureDocs(symbol(widgets, "ImplementedToggleParser").members[0].signatures),
    [
      [
        "parse(value: string): number",
        [["value", "Digits or a flag.\n"]],
        "The parsed value.\n",
        [],
      ],
      [
        "parse(value: boolean): string",
        [["value", "Digits or a flag.\n"]],
        "The parsed value.\n",
        [],
      ],
    ],
  );
});

test("only a method's own implementation, including an inherited one, shares its docs", () => {
  const shared = [[["value", "Digits or a flag.\n"]], "The parsed value.\n", []];
  const undocumented = [[["value", ""]], "", []];

  assert.deepEqual(signatureDocs(symbol(widgets, "InheritedToggleParser").members[0].signatures), [
    ["parse(value: string): number", ...shared],
    ["parse(value: boolean): string", ...shared],
  ]);
  // A static method's body is not an implementation of the abstract instance overloads.
  assert.deepEqual(signatureDocs(symbol(widgets, "MixedToggleParser").members[0].signatures), [
    ["parse(value: boolean): string", ...undocumented],
    [
      "parse(value: string): number",
      [["value", "Decimal digits.\n"]],
      "An integer.\n",
      ["RangeError if out of range.\n"],
    ],
    ["parse(value: number): number", ...undocumented],
  ]);
});

test("documents implicitly public constructor parameter properties", () => {
  const members = [];

  for (const member of symbol(widgets, "ToggleError").members) {
    members.push([
      member.name,
      member.readonly,
      text(member.signatures[0].html),
      text(member.descriptionHtml),
    ]);
  }

  assert.deepEqual(members.slice(0, 3), [
    ["constructor", false, "constructor(code: string, status: number, secret?: string)", ""],
    ["code", true, "readonly code: string", "Machine-readable reason.\n"],
    ["status", false, "status: number", "HTTP-like status.\n"],
  ]);
  assert.equal(
    members.some(([name]) => name === "secret"),
    false,
  );
});

test("omits internal constructor parameter properties like the extractor omits internal members", () => {
  const names = [];

  for (const member of symbol(widgets, "ToggleSnapshot").members) {
    names.push(member.name);
  }

  assert.deepEqual(names, ["constructor", "state"]);
});

test("omits private constructors", () => {
  const names = [];

  for (const member of symbol(widgets, "ToggleRegistry").members) {
    names.push(member.name);
  }

  assert.deepEqual(names, ["size", "create"]);
});

test("constant signatures carry the full type, never TypeScript's truncated text", () => {
  const signature = text(symbol(widgets, "toggleFailures").signatures[0].html);

  assert.doesNotMatch(signature, /\.\.\./);
  assert.match(
    signature,
    /readonly MISSING: \{ readonly status: 404; readonly message: "Toggle not found"; \}/,
  );
  assert.match(
    signature,
    /readonly BROKEN: \{ readonly status: 500; readonly message: "Toggle is broken"; \}/,
  );
});

test("internal entry points contribute only documented symbols no public entry point exports", () => {
  const names = [];

  for (const apiSymbol of widgets.generatedApi) {
    names.push(`${apiSymbol.importPath} ${apiSymbol.name}`);
  }

  assert.deepEqual(names, ["@fixture/widgets/_internal InternalHandle"]);
  assert.equal(widgets.entryPoints.length, 1);
});

test("fails on a symbol slug collision within a package", async () => {
  const root = await brokenFixture(async (dir) => {
    await appendFile(
      join(dir, "packages/widgets/src/index.ts"),
      "\nexport const ToggleLabel = 1;\n",
    );
  });

  await assert.rejects(buildContent({ root, commit }), /API slug "toggle-label" is used by both/);
});

test("fails on Angular diagnostics instead of degrading directives", async () => {
  const root = await brokenFixture(async (dir) => {
    await appendFile(
      join(dir, "packages/widgets/src/index.ts"),
      '\nimport { Component } from "@angular/core";\n\n@Component({ selector: "fx-bad" })\nexport class Bad {}\n',
    );
  });

  await assert.rejects(
    buildContent({ root, commit }),
    /API extraction for .*widgets\/tsconfig\.json failed:[^]*NG2001/,
  );
});

test("writes byte-identical modules for the same inputs", async () => {
  const first = await mkdtemp(join(tmpdir(), "docs-content-out-"));
  const second = await mkdtemp(join(tmpdir(), "docs-content-out-"));

  temporary.push(first, second);
  await writeContent(first, await buildContent({ root: fixture, commit }));
  await writeContent(second, await buildContent({ root: fixture, commit }));

  const names = (await readdir(first)).sort();

  assert.deepEqual(names, [
    "index.generated.ts",
    "model.generated.ts",
    "notes.generated.ts",
    "widgets.generated.ts",
  ]);
  assert.deepEqual((await readdir(second)).sort(), names);

  for (const name of names) {
    assert.equal(
      await readFile(join(first, name), "utf8"),
      await readFile(join(second, name), "utf8"),
    );
  }

  assert.equal(
    await readFile(join(first, "model.generated.ts"), "utf8"),
    await readFile(join(tool, "src/model.ts"), "utf8"),
  );
});
