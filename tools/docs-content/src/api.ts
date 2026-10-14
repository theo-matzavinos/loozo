import type {
  ClassEntry,
  ConstantEntry,
  DirectiveEntry,
  DocEntry,
  DocEntryWithSourceInfo,
  FunctionEntry,
  FunctionSignatureMetadata,
  GenericEntry,
  InterfaceEntry,
  JsDocTagEntry,
  MemberEntry,
  MemberTags,
  MemberType,
  ParameterEntry,
  PropertyEntry,
  TypeAliasEntry,
} from "@angular/compiler-cli";
import { join } from "node:path";
import ts from "typescript";
import { renderMarkdown, repositoryUrl, type PackageContext } from "./markdown.ts";
import type {
  AngularMetadata,
  ApiMember,
  ApiParam,
  ApiSignature,
  ApiSymbol,
  ApiSymbolKind,
  ApiTypeParam,
} from "./model.ts";
import { SourceError } from "./snippets.ts";

const kinds: Record<string, ApiSymbolKind> = {
  function: "function",
  constant: "constant",
  interface: "interface",
  type_alias: "type-alias",
  undecorated_class: "class",
  enum: "enum",
  directive: "directive",
  component: "component",
  pipe: "pipe",
};

const memberKinds: Record<string, ApiMember["kind"]> = {
  property: "property",
  method: "method",
  getter: "getter",
  setter: "setter",
};

const maxLineLength = 100;

/** Kebab-case of a symbol name: `defineRoute` → `define-route`, `RPC_CALL` → `rpc-call`. */
export function symbolSlug(name: string): string {
  return name
    .replace(/([a-z\d])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
}

/** Whether an extracted entry carries any TSDoc. */
export function isDocumented(entry: DocEntry): boolean {
  return entry.description.trim() !== "" || entry.jsdocTags.length > 0;
}

/** The source declarations behind an extracted entry, for what the extractor leaves out. */
export interface DeclarationSource {
  readonly checker: ts.TypeChecker;
  readonly declarations: readonly ts.Declaration[];
}

type Render = (text: string) => string;

/** Where an entry's declaration starts, for error context. */
interface Origin {
  readonly file: string;
  readonly line: number;
}

export function toApiSymbol(
  context: PackageContext,
  entry: DocEntryWithSourceInfo,
  importPath: string,
  source: DeclarationSource,
): ApiSymbol {
  const kind = kinds[entry.entryType];
  const file = join(context.root, entry.source.filePath);

  if (kind === undefined) {
    throw new Error(`${file}: unsupported API entry type "${entry.entryType}" for ${entry.name}`);
  }

  const origin = { file, line: entry.source.startLine };
  const render: Render = (text) => renderMarkdown(context, text, { ...origin, tsdoc: true });
  const tags = entry.jsdocTags;
  const description = fullDescription(entry.description, tags);

  let declaration = "";
  let typeParams: ApiTypeParam[] = [];
  let signatures: ApiSignature[] = [];
  let members: ApiMember[] = [];
  let angular: AngularMetadata | null = null;

  if (kind === "function") {
    const functionEntry = entry as DocEntryWithSourceInfo & FunctionEntry;
    const overloads = functionSignatures(functionEntry);
    const implemented = source.declarations.some(
      (declaration) => ts.isFunctionDeclaration(declaration) && declaration.body !== undefined,
    );
    const fallback = implementationDocs(functionEntry, implemented);
    const typeParamTags = [...tags];
    const generics: GenericEntry[] = [];

    for (const signature of overloads) {
      signatures.push(
        toApiSignature(context, origin, `function ${entry.name}`, signature, {
          fallback,
          parentDescription: description,
          render,
        }),
      );
      typeParamTags.push(...signature.jsdocTags);

      for (const generic of signature.generics) {
        if (!generics.some((existing) => existing.name === generic.name)) {
          generics.push(generic);
        }
      }
    }

    typeParams = toTypeParams(generics, typeParamTags, render);
  } else if (kind === "constant") {
    declaration = `const ${entry.name}: ${constantType(entry, source)}`;
  } else if (kind === "type-alias") {
    const alias = entry as DocEntryWithSourceInfo & TypeAliasEntry;

    declaration = `type ${entry.name}${generics(alias.generics, false)} = ${alias.type}`;
    typeParams = toTypeParams(alias.generics, tags, render);
  } else if (kind === "enum") {
    declaration = `enum ${entry.name}`;
  } else if (kind === "interface") {
    const interfaceEntry = entry as DocEntryWithSourceInfo & InterfaceEntry;
    let heritage = "";

    if (interfaceEntry.extends.length > 0) {
      heritage = ` extends ${interfaceEntry.extends.join(", ")}`;
    }

    declaration = declarationHeader(`interface ${entry.name}`, interfaceEntry.generics, heritage);
    typeParams = toTypeParams(interfaceEntry.generics, tags, render);
    members = toApiMembers(context, origin, interfaceEntry.members, () => false, render);
  } else {
    const classEntry = entry as DocEntryWithSourceInfo & ClassEntry;
    let prefix = "class";
    let heritage = "";

    if (classEntry.isAbstract) {
      prefix = "abstract class";
    }

    if (classEntry.extends !== undefined) {
      heritage += ` extends ${classEntry.extends}`;
    }

    if (classEntry.implements.length > 0) {
      heritage += ` implements ${classEntry.implements.join(", ")}`;
    }

    declaration = declarationHeader(`${prefix} ${entry.name}`, classEntry.generics, heritage);
    typeParams = toTypeParams(classEntry.generics, tags, render);

    if (kind !== "pipe") {
      members = toApiMembers(
        context,
        origin,
        classMembers(classEntry.members, source),
        methodBodies(source),
        render,
      );
    }

    if (kind === "directive" || kind === "component") {
      const directive = entry as DocEntryWithSourceInfo & DirectiveEntry;

      angular = { selector: directive.selector, exportAs: directive.exportAs };
    }
  }

  if (kind !== "function") {
    signatures = [declarationSignature(context, origin, declaration)];
  }

  const deprecated = findTag(tags, "deprecated");
  let deprecatedHtml: string | null = null;

  if (deprecated !== undefined) {
    deprecatedHtml = render(deprecated.comment);
  }

  return {
    name: entry.name,
    slug: symbolSlug(entry.name),
    kind,
    importPath,
    summaryHtml: render(firstParagraph(entry.description)),
    descriptionHtml: render(description),
    typeParams,
    signatures,
    examplesHtml: renderTags(tags, "example", render),
    deprecatedHtml,
    members,
    angular,
    sourceUrl:
      repositoryUrl(context, file, "blob") + `#L${entry.source.startLine}-L${entry.source.endLine}`,
  };
}

/**
 * The constant's type, untruncated. The extractor's own text abbreviates large object types to
 * `{ ...; }`.
 */
function constantType(entry: DocEntryWithSourceInfo, source: DeclarationSource): string {
  for (const declaration of source.declarations) {
    if (ts.isVariableDeclaration(declaration)) {
      const type = source.checker.getTypeAtLocation(declaration);

      // Widen literals the way the extractor does: `const label = "Toggle"` documents `string`.
      return source.checker.typeToString(
        source.checker.getBaseTypeOfLiteralType(type),
        undefined,
        ts.TypeFormatFlags.NoTruncation,
      );
    }
  }

  return (entry as DocEntryWithSourceInfo & ConstantEntry).type;
}

/**
 * Class members as the extractor reports them, corrected against the source: a private or
 * protected constructor is not part of the public API, and constructor parameter properties are
 * public unless marked otherwise (the extractor only sees those explicitly marked `public`).
 */
function classMembers(entries: readonly MemberEntry[], source: DeclarationSource): MemberEntry[] {
  const declaration = source.declarations.find((candidate) => ts.isClassDeclaration(candidate));

  if (declaration === undefined) {
    return [...entries];
  }

  const restricted = ts.ModifierFlags.Private | ts.ModifierFlags.Protected;
  let hiddenConstructor = false;

  for (const member of declaration.members) {
    if (
      ts.isConstructorDeclaration(member) &&
      (ts.getCombinedModifierFlags(member) & restricted) !== 0
    ) {
      hiddenConstructor = true;
    }
  }

  const parameters = new Map<string, ts.ParameterDeclaration>();
  const type = source.checker.getTypeAtLocation(declaration);

  for (const property of type.getProperties()) {
    for (const parameter of property.declarations ?? []) {
      if (
        ts.isParameter(parameter) &&
        ts.isParameterPropertyDeclaration(parameter, parameter.parent)
      ) {
        parameters.set(property.name, parameter);
      }
    }
  }

  const result: MemberEntry[] = [];

  for (const entry of entries) {
    if (entry.name === "constructor" && hiddenConstructor) {
      continue;
    }

    // The extractor keeps the TSDoc hyphen of an explicitly public parameter property's @param.
    if (parameters.has(entry.name)) {
      result.push({ ...entry, description: stripParamHyphen(entry.description) });
    } else {
      result.push(entry);
    }
  }

  const parameterProperties: PropertyEntry[] = [];

  for (const [name, parameter] of parameters) {
    const flags = ts.getCombinedModifierFlags(parameter);

    if (
      (flags & (ts.ModifierFlags.Public | restricted)) !== 0 ||
      isInternalMember(name, parameter)
    ) {
      continue;
    }

    const memberTags: MemberTags[] = [];

    if ((flags & ts.ModifierFlags.Readonly) !== 0) {
      memberTags.push("readonly" as MemberTags);
    }

    if (parameter.questionToken !== undefined) {
      memberTags.push("optional" as MemberTags);
    }

    let description = "";

    for (const tag of ts.getJSDocParameterTags(parameter)) {
      description = ts.getTextOfJSDocComment(tag.comment) ?? "";
    }

    parameterProperties.push({
      name,
      memberType: "property" as MemberType,
      memberTags,
      description: stripParamHyphen(description),
      jsdocTags: [],
      type: source.checker.typeToString(
        source.checker.getTypeAtLocation(parameter),
        undefined,
        ts.TypeFormatFlags.NoTruncation,
      ),
    });
  }

  // Parameter properties come right after the constructor, where they are declared.
  let position = 0;

  for (let index = 0; index < result.length; index++) {
    if (result[index].name === "constructor") {
      position = index + 1;
    }
  }

  result.splice(position, 0, ...parameterProperties);

  return result;
}

/** Whether an extracted method's own declarations include one with a body. */
type HasBody = (method: MemberEntry) => boolean;

/**
 * Resolves each extracted method to its own declarations: the static or instance side of the
 * class, inherited members to their declaring base class. Ambient and abstract methods have no
 * body, and the extractor then reports a bodyless overload as the implementation.
 */
function methodBodies(source: DeclarationSource): HasBody {
  const declaration = source.declarations.find((candidate) => ts.isClassDeclaration(candidate));

  if (declaration === undefined) {
    return () => false;
  }

  // The same types the extractor reads its members from.
  const instance = source.checker.getTypeAtLocation(declaration);
  const symbol = instance.getSymbol();

  if (symbol === undefined) {
    return () => false;
  }

  const statics = source.checker.getTypeOfSymbol(symbol);
  const constructor = symbol.members?.get(ts.InternalSymbolName.Constructor);

  return (method) => {
    if (method.name === "constructor") {
      for (const candidate of constructor?.declarations ?? []) {
        if (ts.isConstructorDeclaration(candidate) && candidate.body !== undefined) {
          return true;
        }
      }

      return false;
    }

    let side = instance;

    if ((method.memberTags as readonly string[]).includes("static")) {
      side = statics;
    }

    for (const property of side.getProperties()) {
      for (const candidate of property.declarations ?? []) {
        // The extractor names members by their source text.
        if (
          ts.isMethodDeclaration(candidate) &&
          candidate.name.getText() === method.name &&
          candidate.body !== undefined
        ) {
          return true;
        }
      }
    }

    return false;
  };
}

/**
 * The extractor's exclusions for Angular-internal members: names starting with `ɵ` or `_`, and
 * `@internal` in the member's TSDoc or leading comments.
 */
function isInternalMember(name: string, node: ts.Node): boolean {
  if (name.startsWith("ɵ") || name.startsWith("_")) {
    return true;
  }

  for (const tag of ts.getJSDocTags(node)) {
    if (tag.tagName.text === "internal") {
      return true;
    }
  }

  const text = node.getSourceFile().text;
  const comments = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];

  for (const comment of comments) {
    if (text.slice(comment.pos, comment.end).includes("@internal")) {
      return true;
    }
  }

  return false;
}

/** Overload signatures, or the implementation when the function has none. */
function functionSignatures(entry: FunctionEntry): FunctionSignatureMetadata[] {
  if (entry.signatures.length > 0) {
    return entry.signatures;
  }

  return [entry.implementation];
}

/**
 * The documentation an implementation shares with its overloads. Without overloads the
 * implementation is the only signature. Without a body (ambient or abstract declarations,
 * interface methods) the extractor reports an overload as the implementation, whose docs belong
 * to that overload alone.
 */
function implementationDocs(
  entry: FunctionEntry,
  hasBody: boolean,
): FunctionSignatureMetadata | undefined {
  if (!hasBody || entry.signatures.length === 0 || !hasDocs(entry.implementation)) {
    return undefined;
  }

  return entry.implementation;
}

function hasDocs(docs: { description: string; jsdocTags: readonly JsDocTagEntry[] }): boolean {
  return docs.description.trim() !== "" || docs.jsdocTags.length > 0;
}

interface SignatureDocs {
  /** Implementation docs for an overload without its own: params, returns and throws. */
  readonly fallback: FunctionSignatureMetadata | undefined;
  /** The symbol's or member's description; an overload repeating it has no own description. */
  readonly parentDescription: string;
  readonly render: Render;
}

function toApiSignature(
  context: PackageContext,
  origin: Origin,
  prefix: string,
  signature: FunctionSignatureMetadata,
  { fallback, parentDescription, render }: SignatureDocs,
): ApiSignature {
  const own = hasDocs(signature);
  let docs = signature;

  if (!own && fallback !== undefined) {
    docs = fallback;
  }

  const params: ApiParam[] = [];

  for (const param of signature.params) {
    let description = param.description;

    if (!own) {
      for (const documented of docs.params) {
        if (documented.name === param.name) {
          description = documented.description;
        }
      }
    }

    params.push(toApiParam(param, description, render));
  }

  const description = fullDescription(signature.description, signature.jsdocTags);
  let descriptionHtml = "";

  if (own && description.trim() !== parentDescription.trim()) {
    descriptionHtml = render(description);
  }

  return {
    html: highlightSignature(context, origin, callSignature(prefix, signature)),
    descriptionHtml,
    params,
    returnsHtml: render(findTag(docs.jsdocTags, "returns")?.comment ?? ""),
    throwsHtml: renderTags(docs.jsdocTags, "throws", render),
  };
}

/** The single signature of a non-function symbol or a property: a declaration without docs. */
function declarationSignature(context: PackageContext, origin: Origin, text: string): ApiSignature {
  return {
    html: highlightSignature(context, origin, text),
    descriptionHtml: "",
    params: [],
    returnsHtml: "",
    throwsHtml: [],
  };
}

/**
 * Highlights declaration text, failing on the abbreviations TypeScript uses when it truncates a
 * type (`{ ...; }`, `... 3 more ...`) instead of publishing an incomplete declaration.
 */
function highlightSignature(context: PackageContext, origin: Origin, text: string): string {
  if (/\.\.\.;|\.\.\. \d+ more \.\.\./.test(text)) {
    throw new SourceError(origin.file, origin.line, `declaration text is truncated: ${text}`);
  }

  return context.highlight(text, "typescript");
}

function toTypeParams(
  entries: readonly GenericEntry[],
  tags: readonly JsDocTagEntry[],
  render: Render,
): ApiTypeParam[] {
  const typeParams: ApiTypeParam[] = [];

  for (const entry of entries) {
    let description = "";

    for (const tag of tags) {
      if (tag.name !== "typeParam") {
        continue;
      }

      // `@typeParam Name - text` keeps the name in the comment, unlike `@param`.
      const match = /^\s*(\S+)\s*(?:-\s*)?([^]*)$/.exec(tag.comment);

      if (match !== null && match[1] === entry.name) {
        description = match[2];
        break;
      }
    }

    typeParams.push({ name: entry.name, descriptionHtml: render(description) });
  }

  return typeParams;
}

/** Converts extracted members, grouping the overloads of one method into one member. */
function toApiMembers(
  context: PackageContext,
  origin: Origin,
  entries: readonly MemberEntry[],
  hasBody: HasBody,
  render: Render,
): ApiMember[] {
  // Interfaces report each method overload as its own entry; classes report one per method.
  const groups = new Map<string, MemberEntry[]>();

  for (const entry of entries) {
    // Skip #private names and computed or symbol keys such as `[routeBrand]`.
    if (entry.name.startsWith("#") || entry.name.startsWith("[")) {
      continue;
    }

    const group = groups.get(entry.name);

    if (group === undefined) {
      groups.set(entry.name, [entry]);
    } else if (entry.memberType === "method" && group[0].memberType === "method") {
      group.push(entry);
    } else {
      throw new SourceError(
        origin.file,
        origin.line,
        `members named "${entry.name}" cannot be documented as one member`,
      );
    }
  }

  const members: ApiMember[] = [];

  for (const [name, group] of groups) {
    const first = group[0];
    const kind = memberKinds[first.memberType];

    if (kind === undefined) {
      throw new Error(`unsupported member type "${first.memberType}" for member ${name}`);
    }

    const tags = first.memberTags as readonly string[];
    const readonly = tags.includes("readonly");
    const optional = tags.includes("optional");
    let modifiers = "";

    if (tags.includes("static")) {
      modifiers += "static ";
    }

    if (tags.includes("protected")) {
      modifiers += "protected ";
    }

    if (kind === "method") {
      const methods = group as (MemberEntry & FunctionEntry)[];
      let documented = methods[0];

      for (const method of methods) {
        if (hasDocs(method)) {
          documented = method;
          break;
        }
      }

      const description = fullDescription(documented.description, documented.jsdocTags);
      const signatures: ApiSignature[] = [];

      for (const method of methods) {
        const fallback = implementationDocs(method, hasBody(method));

        for (const signature of functionSignatures(method)) {
          signatures.push(
            toApiSignature(context, origin, `${modifiers}${name}`, signature, {
              fallback,
              parentDescription: description,
              render,
            }),
          );
        }
      }

      members.push({
        name,
        kind,
        signatures,
        descriptionHtml: render(description),
        readonly,
        optional,
        input: null,
        output: null,
      });
      continue;
    }

    const property = first as PropertyEntry;
    let signature = `${modifiers}${name}${optionalMark(optional)}: ${property.type}`;
    let input: string | null = null;
    let output: string | null = null;

    if (readonly) {
      signature = `${modifiers}readonly ${name}${optionalMark(optional)}: ${property.type}`;
    }

    if (kind === "getter") {
      signature = `${modifiers}get ${name}(): ${property.type}`;
    } else if (kind === "setter") {
      signature = `${modifiers}set ${name}(value: ${property.type})`;
    }

    if (tags.includes("input")) {
      input = property.inputAlias ?? name;
    }

    if (tags.includes("output")) {
      output = property.outputAlias ?? name;
    }

    members.push({
      name,
      kind,
      signatures: [declarationSignature(context, origin, signature)],
      descriptionHtml: render(fullDescription(first.description, first.jsdocTags)),
      readonly,
      optional,
      input,
      output,
    });
  }

  return members;
}

function toApiParam(param: ParameterEntry, description: string, render: Render): ApiParam {
  let name = param.name;

  if (param.isRestParam) {
    name = `...${name}`;
  }

  return {
    name,
    type: param.type,
    optional: param.isOptional,
    descriptionHtml: render(stripParamHyphen(description)),
  };
}

/** TSDoc separates a parameter name from its description with a hyphen. */
function stripParamHyphen(description: string): string {
  return description.replace(/^\s*-\s+/, "");
}

function callSignature(prefix: string, signature: FunctionSignatureMetadata): string {
  const params: string[] = [];

  for (const param of signature.params) {
    let text = `${param.name}${optionalMark(param.isOptional)}: ${param.type}`;

    if (param.isRestParam) {
      text = `...${text}`;
    }

    params.push(text);
  }

  let returns = `: ${signature.returnType}`;

  if (signature.name === "constructor") {
    returns = "";
  }

  const oneLine = `${prefix}${generics(signature.generics, false)}(${params.join(", ")})${returns}`;

  if (oneLine.length <= maxLineLength) {
    return oneLine;
  }

  return `${prefix}${generics(signature.generics, true)}(${list(params, true)})${returns}`;
}

function declarationHeader(prefix: string, entries: readonly GenericEntry[], heritage: string) {
  const oneLine = `${prefix}${generics(entries, false)}${heritage}`;

  if (oneLine.length <= maxLineLength) {
    return oneLine;
  }

  return `${prefix}${generics(entries, true)}${heritage}`;
}

function generics(entries: readonly GenericEntry[], multiline: boolean): string {
  if (entries.length === 0) {
    return "";
  }

  const parts: string[] = [];

  for (const entry of entries) {
    let text = entry.name;

    if (entry.constraint !== undefined) {
      text += ` extends ${entry.constraint}`;
    }

    if (entry.default !== undefined) {
      text += ` = ${entry.default}`;
    }

    parts.push(text);
  }

  return `<${list(parts, multiline)}>`;
}

function list(parts: readonly string[], multiline: boolean): string {
  if (!multiline || parts.length === 0) {
    return parts.join(", ");
  }

  let text = "\n";

  for (const part of parts) {
    text += `  ${part},\n`;
  }

  return text;
}

function optionalMark(optional: boolean): string {
  if (optional) {
    return "?";
  }

  return "";
}

function findTag(tags: readonly JsDocTagEntry[], name: string): JsDocTagEntry | undefined {
  for (const tag of tags) {
    if (tag.name === name) {
      return tag;
    }
  }

  return undefined;
}

function renderTags(tags: readonly JsDocTagEntry[], name: string, render: Render): string[] {
  const result: string[] = [];

  for (const tag of tags) {
    if (tag.name === name) {
      result.push(render(tag.comment));
    }
  }

  return result;
}

function firstParagraph(description: string): string {
  return description.trim().split(/\n\s*\n/)[0];
}

function fullDescription(description: string, tags: readonly JsDocTagEntry[]): string {
  const parts = [description];

  for (const tag of tags) {
    if (tag.name === "remarks") {
      parts.push(tag.comment);
    }
  }

  return parts.join("\n\n");
}
