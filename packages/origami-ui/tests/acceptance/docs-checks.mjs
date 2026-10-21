import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { inventory } from "./inventory.mjs";

const options = process.argv.slice(2);

for (const option of options) {
  assert.equal(option, "--audit", `Unknown option: ${option}`);
}

const audit = options.includes("--audit");
const require = createRequire(path.resolve(".scratch/consumer/package.json"));
const packagePath = require.resolve("@loozo/origami-ui/package.json");
const packageDirectory = path.dirname(packagePath);
const manifest = JSON.parse(await readFile(packagePath, "utf8"));
const authored = [];

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await collect(filename);
    }

    if (entry.isFile() && filename.endsWith(".ts")) {
      const text = await readFile(filename, "utf8");

      authored.push({ filename, text, sha256: createHash("sha256").update(text).digest("hex") });
    }
  }
}

// Only the library's authored entrypoint trees; the package directory also holds dependencies,
// builds, the scratch consumer, tests and acceptance seeds.
for (const directory of [
  "src",
  "utils/src",
  "collection/src",
  "presence/src",
  "collapsible/src",
  "accordion/src",
  "popover/src",
  "toggle/src",
  "tabs/src",
  "toggle-group/src",
  "toolbar/src",
  "radio-group/src",
  "button/src",
  "tooltip/src",
  "field/src",
  "checkbox/src",
  "switch/src",
]) {
  await collect(directory);
}

const authoredComments = [];

for (const file of authored) {
  const source = ts.createSourceFile(file.filename, file.text, ts.ScriptTarget.Latest, true);

  function visit(node) {
    const comments = ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc);

    for (const comment of comments) {
      authoredComments.push({
        file: file.filename,
        position: comment.pos,
        text: comment.getText(source),
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
}

function normalize(text) {
  return text.replace(/\s+/g, " ").replace(/\*/g, "").trim();
}

const directiveDefaults = {
  "OrigamiPresence.present": ["false", /\bfalse\b/i],
  "OrigamiCollectionItem.value": ["generated value", /generat|unique|opaque/i],
  "OrigamiCollapsible.expanded": ["false", /\bfalse\b/i],
  "OrigamiCollapsible.disabled": ["false", /\bfalse\b/i],
  "OrigamiCollapsible.hiding": ["hidden", /hidden/i],
  "OrigamiCollapsibleTrigger.id": ["owner-derived generated ID", /generat|owner.derived/i],
  "OrigamiCollapsiblePanel.id": ["owner-derived generated ID", /generat|owner.derived/i],
  "OrigamiAccordionSingle.value": ["null", /\bnull\b/i],
  "OrigamiAccordionSingle.disabled": ["false", /\bfalse\b/i],
  "OrigamiAccordionSingle.collapsible": ["false", /\bfalse\b/i],
  "OrigamiAccordionMultiple.value": ["empty array", /empty|\[\]/i],
  "OrigamiAccordionMultiple.disabled": ["false", /\bfalse\b/i],
  "OrigamiAccordionItem.value": ["generated value", /generat|unique|opaque/i],
  "OrigamiAccordionItem.disabled": ["false", /\bfalse\b/i],
  "OrigamiAccordionItem.hiding": ["hidden", /hidden/i],
  "OrigamiAccordionTrigger.id": ["owner-derived generated ID", /generat|owner.derived/i],
  "OrigamiAccordionPanel.id": ["owner-derived generated ID", /generat|owner.derived/i],
  "OrigamiPopover.open": ["false", /\bfalse\b/i],
  "OrigamiPopover.disabled": ["false", /\bfalse\b/i],
  "OrigamiPopover.dismissible": ["true", /\btrue\b/i],
  "OrigamiPopoverTrigger.id": ["opaque generated hosted ID", /generat/i],
  "OrigamiPopoverAnchor.id": ["opaque generated hosted ID", /generat/i],
  "OrigamiPopoverContent.id": ["opaque generated hosted ID", /generat/i],
  "OrigamiPopoverContent.side": ["block-end", /block.?end/i],
  "OrigamiPopoverContent.align": ["start", /\bstart\b/i],
  "OrigamiPopoverContent.gap": ["0 CSS px", /\b0\b|\bzero\b/i],
  "OrigamiToggle.pressed": ["false", /\bfalse\b/i],
  "OrigamiToggle.disabled": ["false", /\bfalse\b/i],
  "OrigamiToggle.focusableWhenDisabled": ["false", /\bfalse\b/i],
  "OrigamiTabs.value": ["null", /\bnull\b/i],
  "OrigamiTabs.disabled": ["false", /\bfalse\b/i],
  "OrigamiTabs.orientation": ["horizontal", /\bhorizontal\b/i],
  "OrigamiTabs.activation": ["automatic", /\bautomatic\b/i],
  "OrigamiTabsTrigger.disabled": ["false", /\bfalse\b/i],
  "OrigamiToggleGroupSingle.value": ["null", /\bnull\b/i],
  "OrigamiToggleGroupSingle.disabled": ["false", /\bfalse\b/i],
  "OrigamiToggleGroupSingle.orientation": ["horizontal", /\bhorizontal\b/i],
  "OrigamiToggleGroupSingle.deselectable": ["false", /\bfalse\b/i],
  "OrigamiToggleGroupMultiple.value": ["empty array", /empty|\[\]/i],
  "OrigamiToggleGroupMultiple.disabled": ["false", /\bfalse\b/i],
  "OrigamiToggleGroupMultiple.orientation": ["horizontal", /\bhorizontal\b/i],
  "OrigamiToggleGroupItem.value": ["generated value", /generat|unique|opaque/i],
  "OrigamiToggleGroupItem.disabled": ["false", /\bfalse\b/i],
  "OrigamiToolbar.orientation": ["horizontal", /\bhorizontal\b/i],
  "OrigamiToolbarItem.disabled": ["false", /\bfalse\b/i],
  "OrigamiToolbarItem.focusableWhenDisabled": ["false", /\bfalse\b/i],
  "OrigamiToolbarToggle.pressed": ["false", /\bfalse\b/i],
  "OrigamiToolbarToggle.disabled": ["false", /\bfalse\b/i],
  "OrigamiToolbarToggle.focusableWhenDisabled": ["false", /\bfalse\b/i],
  "OrigamiToolbarPopoverTrigger.id": ["opaque generated hosted ID", /generat/i],
  "OrigamiToolbarPopoverTrigger.disabled": ["false", /\bfalse\b/i],
  "OrigamiToolbarPopoverTrigger.focusableWhenDisabled": ["false", /\bfalse\b/i],
  "OrigamiRadioGroup.value": ["null", /\bnull\b/i],
  "OrigamiRadioGroup.disabled": ["false", /\bfalse\b/i],
  "OrigamiRadioGroupItem.value": ["generated value", /generat|unique|opaque/i],
  "OrigamiRadioGroupItem.disabled": ["false", /\bfalse\b/i],
  "OrigamiRadioGroupItem.focusableWhenDisabled": ["false", /\bfalse\b/i],
  "OrigamiButton.disabled": ["false", /\bfalse\b/i],
  "OrigamiButton.focusableWhenDisabled": ["false", /\bfalse\b/i],
  "OrigamiTooltip.open": ["false", /\bfalse\b/i],
  "OrigamiTooltip.disabled": ["false", /\bfalse\b/i],
  "OrigamiTooltip.openDelay": ["600 ms", /\b600\b/],
  "OrigamiTooltipContent.id": ["opaque generated hosted ID", /generat/i],
  "OrigamiTooltipContent.side": ["block-start", /block.?start/i],
  "OrigamiTooltipContent.align": ["center", /\bcenter\b/i],
  "OrigamiTooltipContent.gap": ["0 CSS px", /\b0\b|\bzero\b/i],
  "OrigamiFieldLabel.id": ["opaque generated hosted ID", /generat/i],
  "OrigamiFieldControl.id": ["opaque generated hosted ID", /generat/i],
  "OrigamiFieldDescription.id": ["opaque generated hosted ID", /generat/i],
  "OrigamiFieldError.id": ["opaque generated hosted ID", /generat/i],
  "OrigamiCheckbox.checked": ["false", /\bfalse\b/i],
  "OrigamiCheckbox.disabled": ["false", /\bfalse\b/i],
  "OrigamiCheckbox.focusableWhenDisabled": ["false", /\bfalse\b/i],
  "OrigamiCheckbox.id": ["opaque generated hosted ID", /generat/i],
  "OrigamiSwitch.checked": ["false", /\bfalse\b/i],
  "OrigamiSwitch.disabled": ["false", /\bfalse\b/i],
  "OrigamiSwitch.focusableWhenDisabled": ["false", /\bfalse\b/i],
  "OrigamiSwitch.id": ["opaque generated hosted ID", /generat/i],
};
const subjects = [];
const failures = [];
const excludedExternalMembers = [];

for (const entrypoint of Object.keys(inventory)) {
  let key = ".";

  if (entrypoint) {
    key = `./${entrypoint}`;
  }

  const declaration = path.resolve(packageDirectory, manifest.exports[key].types);
  const program = ts.createProgram([declaration], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.Preserve,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(declaration);

  assert.ok(source);

  const moduleSymbol = checker.getSymbolAtLocation(source);

  assert.ok(moduleSymbol);

  for (let symbol of checker.getExportsOfModule(moduleSymbol)) {
    const exportedName = symbol.name;

    if (symbol.flags & ts.SymbolFlags.Alias) {
      symbol = checker.getAliasedSymbol(symbol);
    }

    const classDescription = ts.displayPartsToString(symbol.getDocumentationComment(checker));

    review(symbol, exportedName, classDescription);

    if (exportedName.startsWith("ɵ")) {
      continue;
    }

    if (
      symbol.flags &
      (ts.SymbolFlags.Class | ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias)
    ) {
      const declared = checker.getDeclaredTypeOfSymbol(symbol);

      for (const member of checker.getPropertiesOfType(declared)) {
        if (!consumerMember(member, exportedName)) {
          continue;
        }

        review(member, `${exportedName}.${member.name}`, classDescription);
      }
    }

    if (symbol.flags & ts.SymbolFlags.Class) {
      const location = symbol.valueDeclaration ?? symbol.declarations?.[0];

      assert.ok(location);

      const constructorType = checker.getTypeOfSymbolAtLocation(symbol, location);

      for (const member of checker.getPropertiesOfType(constructorType)) {
        if (member.name === "prototype" || !consumerMember(member, exportedName)) {
          continue;
        }

        review(member, `${exportedName}.${member.name}`, classDescription);
      }
    }
  }

  function consumerMember(member, exportedName) {
    const declarations = member.declarations ?? [];
    const packageDeclarations = declarations.filter((node) => {
      const filename = path.relative(packageDirectory, node.getSourceFile().fileName);

      return (
        filename !== ".." && !filename.startsWith(`..${path.sep}`) && !path.isAbsolute(filename)
      );
    });

    // getPropertiesOfType uses apparent types: literal-string aliases inherit String's
    // lib.es*.d.ts methods. Those are not authored library API/TSDoc subjects. Retain
    // local/inherited packaged declarations and record all external exclusions explicitly.
    if (declarations.length > 0 && packageDeclarations.length === 0) {
      excludedExternalMembers.push({
        entrypoint: key,
        name: `${exportedName}.${member.name}`,
        declarations: declarations.map((node) => node.getSourceFile().fileName),
      });

      return false;
    }

    if (
      ["ɵfac", "ɵdir", "ɵprov", "ɵcmp", "ɵpipe", "ɵmod", "ɵinj"].includes(member.name) ||
      member.name.startsWith("#")
    ) {
      return false;
    }

    for (const node of member.declarations ?? []) {
      const modifiers = ts.getCombinedModifierFlags(node);

      if (modifiers & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) {
        return false;
      }
    }

    return true;
  }

  function review(symbol, name, context) {
    const declarations = symbol.declarations ?? [];
    const description = ts.displayPartsToString(symbol.getDocumentationComment(checker));
    const tags = symbol
      .getJsDocTags(checker)
      .map((tag) => ({ name: tag.name, text: ts.displayPartsToString(tag.text) }));
    const packagedComments = [];

    for (const node of declarations) {
      for (const comment of ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc)) {
        packagedComments.push(comment.getText(node.getSourceFile()));
      }
    }

    const authoredMatches = [];

    for (const comment of packagedComments) {
      for (const candidate of authoredComments) {
        if (normalize(candidate.text) === normalize(comment)) {
          authoredMatches.push(candidate);
        }
      }
    }

    const semanticText = `${context} ${description} ${tags.map((tag) => tag.text).join(" ")}`;
    const internal =
      name.startsWith("ɵ") ||
      symbol.name.startsWith("ɵ") ||
      tags.some((tag) => tag.name === "internal");
    let meaningfulDescription = description;

    // TypeScript puts prose following @internal into the tag's text, not the symbol's
    // description. Preserve both raw fields; meaningful retained internal prose still
    // needs authored provenance and @internal, and never becomes supported authoring API.
    if (internal && !meaningfulDescription.trim()) {
      meaningfulDescription = tags
        .filter((tag) => tag.name === "internal")
        .map((tag) => tag.text)
        .join("\n");
    }

    const issues = [];

    if (!meaningfulDescription.trim()) {
      issues.push("Missing meaningful description (including inherited documentation)");
    }

    if (
      meaningfulDescription.trim() === symbol.name ||
      meaningfulDescription.trim() === `${symbol.name}.`
    ) {
      issues.push("Description merely repeats the declaration name");
    }

    if (packagedComments.length > 0 && authoredMatches.length === 0) {
      issues.push("Packaged TSDoc is not traceable to authored TSDoc");
    }

    if (internal && !tags.some((tag) => tag.name === "internal")) {
      issues.push("Compiler-required declaration/member is not documented @internal");
    }

    if (internal && (packagedComments.length === 0 || authoredMatches.length === 0)) {
      issues.push(
        "Internal declaration/member comments are missing, stripped or not retained from authored source",
      );
    }

    const facets = [];

    // Optional `--audit`: regex probes for frozen defaults/facets. They cannot certify prose
    // (the D1 semantic review does), so they stay out of the normal inventory/retention gate.
    if (audit) {
      const defaultPolicy = directiveDefaults[name];

      if (defaultPolicy) {
        facets.push([`frozen directive default: ${defaultPolicy[0]}`, defaultPolicy[1]]);
      }

      if (name === "injectDeferred") {
        facets.push([
          "capture-time nearest injection and deferred resolution",
          /captur|defer/i,
          /inject/i,
          /later|resolv/i,
        ]);
      }

      if (name === "injectUniqueId") {
        facets.push(["application-local uniqueness", /unique/i, /application/i]);
        facets.push([
          "the browser reuses the host's rendered id while hydrating",
          /browser/i,
          /rendered/i,
          /\bid\b/i,
          /host/i,
          /hydrat/i,
        ]);
        facets.push(["server allocations carry the s prefix", /server/i, /og-<key>-s<n>/]);
        facets.push(["keys are validated", /key/i, /\/\^\[a-z\]\[a-z0-9-\]\*\$\//, /TypeError/]);
      }

      if (name === "injectUniqueValue") {
        facets.push(["application-local uniqueness", /unique/i, /application.local/i]);
        facets.push([
          "never rendered, and not guaranteed to match across hydration",
          /never rendered/i,
          /isn't guaranteed to match|not guaranteed to match/i,
          /hydrat/i,
        ]);
        facets.push(["keys are validated", /key/i, /\/\^\[a-z\]\[a-z0-9-\]\*\$\//, /TypeError/]);
      }

      if (name.includes("State.")) {
        facets.push(["readonly observation ownership", /readonly|read.only|observ/i]);
      }

      if (name.endsWith("provideExisting") || name.endsWith("provideFactory")) {
        facets.push([
          "Options substitution and provider usage",
          /option|configur/i,
          /provid|factor|alias/i,
        ]);
      }

      if (name === "OrigamiPopoverContent.gap" || name === "OrigamiPopoverContentOptions.gap") {
        facets.push([
          "finite nonnegative CSS-pixel gap",
          /finite/i,
          /non.?negative|zero or greater/i,
          /pixel|\bpx\b/i,
        ]);
      }

      if (name === "OrigamiPopoverContentState.open") {
        facets.push(["retention differs from requested intent", /retain|presence|exit|closing/i]);
      }

      if (name === "OrigamiPopoverState.open") {
        facets.push([
          "requested intent differs from retention/native presentation",
          /request|intent|desired/i,
        ]);
      }

      if (name === "OrigamiCollapsibleHiding") {
        facets.push([
          "ordinary-hidden progressive browser degradation",
          /until.found/i,
          /support|browser|progress/i,
          /hidden/i,
        ]);
      }
    }

    for (const [facet, ...expressions] of facets) {
      if (!expressions.every((expression) => expression.test(semanticText))) {
        issues.push(`Missing semantic facet: ${facet}`);
      }
    }

    const record = {
      entrypoint: key,
      name,
      supportedAuthoring: !internal,
      description,
      meaningfulDescription,
      tags,
      context,
      declarations: declarations.map((node) => ({
        path: node.getSourceFile().fileName,
        start: node.pos,
      })),
      packagedComments,
      authoredMatches,
      auditedFacets: facets.map((facet) => facet[0]),
      issues,
    };

    subjects.push(record);

    if (issues.length > 0) {
      failures.push({ name, issues });
    }
  }
}

assert.ok(subjects.length > 0, "An empty seed cannot pass the public documentation inventory");
await mkdir(".acceptance-evidence", { recursive: true });
await writeFile(
  ".acceptance-evidence/public-tsdoc-inventory.json",
  JSON.stringify(
    {
      authored: authored.map(({ filename, sha256 }) => ({ filename, sha256 })),
      subjects,
      failures,
      excludedExternalMembers,
      facetAudit: audit,
      semanticReview:
        "Parent must review every recorded subject against the frozen defaults, ownership, composition, lifecycle/errors, hydration, browser limits and examples. Automated presence/facet checks alone cannot certify meaningful prose.",
      excluded:
        "Compiler-generated static metadata (ɵfac/ɵdir/ɵprov/ɵcmp/ɵpipe/ɵmod/ɵinj), private/protected members, members of compiler-only ɵ exports, and explicitly inventoried external apparent-type members (for example TypeScript String methods) are excluded. Compiler-required exported declarations and authored @internal members such as OrigamiToggleGroupSingleOptions.ɵprovideRoot and SSR lifecycle hooks are included for meaningful retained-comment/provenance/@internal checks, but excluded from supported authoring API. Internal prose may occur in TypeScript's @internal tag text; raw description/tags and meaningfulDescription are all retained.",
    },
    null,
    2,
  ),
);
assert.equal(failures.length, 0, JSON.stringify(failures, null, 2));

let checked = "subject inventory and authored TSDoc retention";

if (audit) {
  checked += " plus semantic facet audit";
}

console.log(
  `D1 machine check (${subjects.length} subjects): ${checked} passed; the whole-subject semantic review remains a release task.`,
);
