import {
  defineRoute,
  createUrl,
  enumParam,
  numberParam,
  stringParam,
  booleanParam,
  optionalSearchParam,
  nullableSearchParam,
  type Route,
  type ParamCodec,
} from "@loozo/angular-router";
import type {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  Route as NativeRoute,
  PartialMatchRouteSnapshot,
  UrlSegment,
  GuardResult,
  MaybeAsync,
  CanDeactivateFn,
  ResolveFn,
} from "@angular/router";
import { RedirectCommand, DefaultUrlSerializer, UrlTree } from "@angular/router";
import { of } from "rxjs";

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false;

function exact<_Type extends true>(): void {}

export const product = defineRoute("products/$productId", {
  params: { productId: numberParam },
  search: { tab: optionalSearchParam(enumParam(["details", "reviews"])) },
  fragments: ["summary", "reviews"],
});
export const productUrl: string = createUrl(product, {
  params: { productId: 42 },
  search: { tab: "reviews" },
  fragment: "summary",
});
const plain: Route<"plain", {}, {}> = defineRoute("plain", {});
// Existing three-parameter Route annotations can erase newly inferred fragment names.
const _compatibleProduct: Route<
  "products/$productId",
  { readonly productId: number },
  { readonly tab?: "details" | "reviews" }
> = product;
// @ts-expect-error The private nominal brand survives emitted declarations.
const _fake: Route<"plain", {}, {}> = { path: "plain" };

// @ts-expect-error Local codec exactness holds for variables.
defineRoute("$id", { params: { id: numberParam, extra: stringParam } });

const extras = { id: numberParam, extra: stringParam };

// @ts-expect-error Local codec exactness holds for variables.
defineRoute("$id", { params: extras });
// @ts-expect-error No helper root exports.
import { routeMetadata as _routeMetadata } from "@loozo/angular-router";

const objectCodec: ParamCodec<{ label: string; count: number }> = {
  parse: async (raw) => ({ label: raw, count: 1 }),
  stringify: (value) => value.label,
};
const parent = defineRoute("teams/$teamId", {
  params: { teamId: numberParam },
  search: {
    teamId: stringParam,
    flag: nullableSearchParam(booleanParam),
    box: optionalSearchParam(objectCodec),
  },
  fragments: ["parent"],
  resolve: { ancestor: () => 42 },
});
const layout = defineRoute("", { parent });
const localDataKey = Symbol("local data");
const symbolData = defineRoute("symbol", {
  parent: layout,
  data: { [localDataKey]: { mutable: true } },
  resolve: {
    [localDataKey]: (inputs, snapshot, state) => {
      exact<Equal<typeof inputs.params.teamId, number>>();
      exact<Equal<typeof snapshot, ActivatedRouteSnapshot>>();
      exact<Equal<typeof state, RouterStateSnapshot>>();

      return "symbol value";
    },
  },
});

exact<Equal<NonNullable<typeof symbolData.__data>[typeof localDataKey], string>>();

const redirected = new RedirectCommand(new DefaultUrlSerializer().parse("/other"));
const nativeDeactivate: CanDeactivateFn<{ changed: boolean }> = (
  component,
  current,
  state,
  next,
) => {
  exact<Equal<typeof current, ActivatedRouteSnapshot>>();
  exact<Equal<typeof state, RouterStateSnapshot>>();
  exact<Equal<typeof next, RouterStateSnapshot>>();

  return !component.changed;
};
const nativeTitle: ResolveFn<string> = (snapshot) => String(snapshot.url.length);
const child = defineRoute("items/$id", {
  parent: layout,
  params: { id: objectCodec },
  fragments: ["child"],
  title: (inputs, snapshot, state) => {
    exact<Equal<typeof inputs.params.teamId, number>>();
    exact<Equal<typeof inputs.params.id, { label: string; count: number }>>();
    exact<Equal<typeof inputs.search.teamId, string>>();
    exact<Equal<typeof snapshot, ActivatedRouteSnapshot>>();
    exact<Equal<typeof state, RouterStateSnapshot>>();

    return of(inputs.params.id.label);
  },
  canDeactivate: [nativeDeactivate],
  runGuardsAndResolvers: (from, to) => {
    exact<Equal<typeof from, ActivatedRouteSnapshot>>();
    exact<Equal<typeof to, ActivatedRouteSnapshot>>();

    return from !== to;
  },
  canActivate: [
    (inputs, snapshot, state) => {
      exact<Equal<typeof inputs.params.teamId, number>>();
      exact<Equal<typeof inputs.params.id, { label: string; count: number }>>();
      exact<Equal<typeof inputs.search.teamId, string>>();
      exact<Equal<typeof inputs.search.flag, boolean | null>>();
      exact<Equal<typeof inputs.search.box, { label: string; count: number } | undefined>>();
      exact<Equal<typeof snapshot, ActivatedRouteSnapshot>>();
      exact<Equal<typeof state, RouterStateSnapshot>>();
      // @ts-expect-error Parsed bindings are readonly.
      inputs.params.id = { label: "bad", count: 2 };
      // @ts-expect-error Container has no data.
      void inputs.data;
      inputs.params.id.count += 1;

      return Promise.resolve(true);
    },
  ],
  canActivateChild: [
    ({ params }, snapshot, state) => {
      exact<Equal<typeof params.teamId, number>>();
      exact<Equal<typeof snapshot, ActivatedRouteSnapshot>>();
      exact<Equal<typeof state, RouterStateSnapshot>>();

      return of(redirected);
    },
  ],
  canMatch: [
    (inputs, routeConfig, segments, partialSnapshot) => {
      exact<Equal<typeof inputs.params.id, { label: string; count: number }>>();
      exact<Equal<typeof inputs.search.teamId, string>>();
      exact<Equal<typeof routeConfig, NativeRoute>>();
      exact<Equal<typeof segments, UrlSegment[]>>();
      exact<Equal<typeof partialSnapshot, PartialMatchRouteSnapshot>>();
      // @ts-expect-error Matching callbacks have no ancestor positional params.
      void inputs.params.teamId;
      // @ts-expect-error Native route config is not any.
      void routeConfig.notNative;
      // @ts-expect-error Native partial snapshot is not any.
      void partialSnapshot.notNative;

      return true;
    },
  ],
  resolve: {
    local: (inputs, snapshot, state) => {
      exact<Equal<typeof inputs.params.teamId, number>>();
      exact<Equal<typeof snapshot, ActivatedRouteSnapshot>>();
      exact<Equal<typeof state, RouterStateSnapshot>>();

      return { label: inputs.params.id.label };
    },
    promised: async () => ({ count: 1 }),
    observed: () => of({ visible: true }),
    mixed: () => {
      if (Math.random() > 0.5) {
        return of(redirected);
      }

      return Promise.resolve({ complete: true });
    },
    redirect: () => redirected,
    promisedRedirect: async () => redirected,
    observedRedirect: () => of(redirected),
  },
});

type Data = NonNullable<typeof child.__data>;
exact<Equal<Data["local"], { label: string }>>();
exact<Equal<Data["promised"], { count: number }>>();
exact<Equal<Data["observed"], { visible: boolean }>>();
exact<Equal<Data["mixed"], { complete: boolean }>>();
exact<Equal<Data["redirect"], never>>();
exact<Equal<Data["promisedRedirect"], never>>();
exact<Equal<Data["observedRedirect"], never>>();
// @ts-expect-error Data is local only.
type _Ancestor = Data["ancestor"];
defineRoute("static-title", { title: "Static" });
defineRoute("promised-title", { parent, title: async ({ params }) => `Team ${params.teamId}` });
// @ts-expect-error A title callback takes parsed inputs, not a snapshot-first native ResolveFn.
defineRoute("native-title", { title: nativeTitle });
// @ts-expect-error A title resolves to a string.
defineRoute("numeric-title", { title: () => 42 });
// @ts-expect-error Search namespace does not permit inherited redeclaration.
defineRoute("again", { parent: layout, search: { teamId: numberParam } });
// @ts-expect-error Path namespace does not permit inherited redeclaration.
defineRoute("$teamId", { parent: layout, params: { teamId: numberParam } });
createUrl(child, {
  params: { teamId: 7, id: { label: "x", count: 1 } },
  search: { teamId: "q", flag: null },
  // @ts-expect-error Only child fragment names are accepted.
  fragment: "parent",
});

const suffix = defineRoute("$scalar/fixed/$pieces[]", {
  params: { scalar: numberParam, pieces: objectCodec },
});

exact<Equal<NonNullable<typeof suffix.__params>["scalar"], number>>();
exact<
  Equal<NonNullable<typeof suffix.__params>["pieces"], readonly { label: string; count: number }[]>
>();
createUrl(suffix, { params: { scalar: 1, pieces: [] } });

const compatibleCatchall: Route<
  "$scalar/fixed/$pieces[]",
  { readonly scalar: number; readonly pieces: readonly { label: string; count: number }[] },
  {}
> = suffix;

// @ts-expect-error Three-parameter annotations still retain catchall leaf information.
defineRoute("", { parent: compatibleCatchall });
// @ts-expect-error Scalar before catchall remains scalar.
createUrl(suffix, { params: { scalar: [1], pieces: [] } });
// @ts-expect-error Catchall after scalar remains an array.
createUrl(suffix, { params: { scalar: 1, pieces: { label: "x", count: 1 } } });
// @ts-expect-error Even pathless children of a catchall are excluded.
defineRoute("", { parent: suffix });

const wrapped = optionalSearchParam(nullableSearchParam(numberParam));
const explicitNone = defineRoute("explicit-none", {
  search: { page: optionalSearchParam(numberParam, undefined) },
});

exact<Equal<NonNullable<typeof explicitNone.__search>["page"], number | undefined>>();

// @ts-expect-error Reversed nullable-optional order.
nullableSearchParam(optionalSearchParam(numberParam));
// @ts-expect-error Wrappers cannot be path codecs.
defineRoute("$id", { params: { id: wrapped } });

const arrayCodec: ParamCodec<readonly string[]> = {
  parse: (raw) => raw.split(","),
  stringify: (value) => value.join(","),
};
const destination = defineRoute("docs/$parts[]", {
  params: { parts: stringParam },
  fragments: ["summary"],
});

defineRoute("packed/$array", {
  params: { array: arrayCodec },
  redirect: {
    to: destination,
    params: { parts: "array" },
    search: { mode: "drop" },
    fragment: { mode: "replace", value: "summary" },
  },
});
defineRoute("$array", {
  params: { array: stringParam },
  redirect: {
    to: destination,
    // @ts-expect-error Logical scalar string cannot feed a catchall string array.
    params: { parts: "array" },
    search: { mode: "drop" },
    fragment: { mode: "drop" },
  },
});
defineRoute("$array", {
  params: { array: arrayCodec },
  redirect: {
    to: destination,
    // @ts-expect-error Unknown mapping keys fail.
    params: { parts: "array", extra: "array" },
    search: { mode: "drop" },
    fragment: { mode: "drop" },
  },
});
defineRoute("$parts[]", {
  params: { parts: stringParam },
  redirect: { to: destination, search: { mode: "drop" }, fragment: { mode: "drop" } },
  // @ts-expect-error Own canMatch conflicts with redirect declarations.
  canMatch: [],
});

const root = defineRoute("", {});
const unknownReplacement = { extra: "x" };

defineRoute("alias", {
  redirect: {
    to: root,
    // @ts-expect-error Searchless replacement variables cannot introduce keys.
    search: { mode: "replace", values: unknownReplacement },
    fragment: { mode: "drop" },
  },
});
// @ts-expect-error Unknown input options fail.
createUrl(plain, { unexpected: true });

const invalidNative: MaybeAsync<GuardResult> = false;

void invalidNative;

const prototypeOptional = defineRoute("prototype-optional", {
  search: {
    constructor: optionalSearchParam(stringParam),
    toString: optionalSearchParam(numberParam),
    ["__proto__"]: optionalSearchParam(enumParam(["one", "two"])),
  },
  resolve: {
    label: ({ search }) => {
      exact<Equal<typeof search.constructor, string | undefined>>();
      exact<Equal<typeof search.toString, number | undefined>>();
      exact<Equal<typeof search.__proto__, "one" | "two" | undefined>>();

      return search.constructor;
    },
  },
});

exact<Equal<NonNullable<typeof prototypeOptional.__data>["label"], string | undefined>>();
createUrl(prototypeOptional, {});
createUrl(prototypeOptional, { search: {} });
createUrl(prototypeOptional, { search: { constructor: "logical" } });
createUrl(prototypeOptional, { search: { toString: 42 } });
createUrl(prototypeOptional, { search: { ["__proto__"]: "one" } });
createUrl(prototypeOptional, { search: { constructor: undefined, toString: undefined } });
// @ts-expect-error Supplied-key inference does not admit unknown literals.
createUrl(prototypeOptional, { search: { unknown: "wrong" } });
// @ts-expect-error Constructor is a logical string, not an inherited Function.
createUrl(prototypeOptional, { search: { constructor: () => undefined } });
// @ts-expect-error The declared string codec does not accept numbers.
createUrl(prototypeOptional, { search: { constructor: 42 } });
// @ts-expect-error toString is a logical number, not a native method.
createUrl(prototypeOptional, { search: { toString: () => "wrong" } });
// @ts-expect-error Numeric optional binding does not accept strings.
createUrl(prototypeOptional, { search: { toString: "wrong" } });
// @ts-expect-error Computed prototype key retains its enum union.
createUrl(prototypeOptional, { search: { ["__proto__"]: "other" } });

const prototypeText = optionalSearchParam(stringParam);
const prototypeAll = defineRoute("all-prototype", {
  search: {
    constructor: prototypeText,
    toString: prototypeText,
    toLocaleString: prototypeText,
    valueOf: prototypeText,
    hasOwnProperty: prototypeText,
    isPrototypeOf: prototypeText,
    propertyIsEnumerable: prototypeText,
    ["__proto__"]: prototypeText,
  },
});

createUrl(prototypeAll, {});
createUrl(prototypeAll, { search: {} });
createUrl(prototypeAll, { search: { constructor: "owned", hasOwnProperty: "logical" } });
createUrl(prototypeAll, { search: { toString: "logical", ["__proto__"]: "owned" } });
// @ts-expect-error All-prototype inputs still reject unknown literals.
createUrl(prototypeAll, { search: { extra: "wrong" } });
// @ts-expect-error Logical constructor values are never widened to Function.
createUrl(prototypeAll, { search: { constructor: () => undefined } });

const onlyConstructor = defineRoute("only-constructor", {
  search: { constructor: optionalSearchParam(stringParam) },
});
const onlyToString = defineRoute("only-tostring", {
  search: { toString: optionalSearchParam(stringParam) },
});

createUrl(onlyConstructor, {});
createUrl(onlyConstructor, { search: {} });
createUrl(onlyToString, {});
createUrl(onlyToString, { search: {} });
// @ts-expect-error Empty-input inference rejects arbitrary literal keys.
createUrl(onlyConstructor, { search: { arbitrary: 42 } });
// @ts-expect-error Supplied logical values remain codec-typed.
createUrl(onlyConstructor, { search: { constructor: () => undefined } });
// @ts-expect-error A supplied native method is not a logical string.
createUrl(onlyToString, { search: { toString: () => "wrong" } });

defineRoute("prototype-drop", {
  redirect: { to: prototypeOptional, search: { mode: "drop" }, fragment: { mode: "drop" } },
});
defineRoute("prototype-preserve", {
  redirect: { to: prototypeOptional, search: { mode: "preserve" }, fragment: { mode: "drop" } },
});
defineRoute("prototype-replace", {
  redirect: {
    to: prototypeOptional,
    search: { mode: "replace", values: {} },
    fragment: { mode: "drop" },
  },
});
defineRoute("constructor-replace", {
  redirect: {
    to: onlyConstructor,
    search: { mode: "replace", values: {} },
    fragment: { mode: "drop" },
  },
});

defineRoute("prototype-replace-wrong", {
  redirect: {
    to: prototypeOptional,
    // @ts-expect-error Replacement inputs retain logical prototype-named value types.
    search: { mode: "replace", values: { constructor: () => undefined } },
    fragment: { mode: "drop" },
  },
});

const mixedPrototype = defineRoute("prototype-mixed", {
  search: {
    q: numberParam,
    constructor: optionalSearchParam(stringParam),
    toString: optionalSearchParam(numberParam),
  },
  canActivate: [
    ({ search }) => {
      exact<Equal<typeof search.q, number>>();
      exact<Equal<typeof search.constructor, string | undefined>>();
      exact<Equal<typeof search.toString, number | undefined>>();

      return true;
    },
  ],
});

createUrl(mixedPrototype, { search: { q: 7 } });
createUrl(mixedPrototype, { search: { q: 7, constructor: "logical" } });
createUrl(mixedPrototype, { search: { q: 7, toString: 42 } });

const emptySearch = {};
const partialConstructor = { constructor: "logical" };
const partialToString = { toString: 42 };
const optionalSubset = { constructor: "logical", toString: 42 };
const allSubset = { constructor: "logical", hasOwnProperty: "logical" };
const mixedRequired = { q: 7 };
const mixedConstructor = { q: 7, constructor: "logical" };
const mixedToString = { q: 7, toString: 42 };
const mixedSubset = { q: 7, constructor: "logical", toString: 42 };
const typedMixed: { q: number; toString: number } = mixedToString;
const typedTarget: Route<
  "prototype-mixed",
  {},
  { readonly q: number; readonly constructor?: string; readonly toString?: number }
> = mixedPrototype;

createUrl(prototypeOptional, { search: emptySearch });
createUrl(prototypeOptional, { search: partialConstructor });
createUrl(prototypeOptional, { search: partialToString });
createUrl(prototypeOptional, { search: optionalSubset });
createUrl(prototypeAll, { search: allSubset });
createUrl(mixedPrototype, { search: mixedRequired });
createUrl(mixedPrototype, { search: mixedConstructor });
createUrl(mixedPrototype, { search: mixedToString });
createUrl(mixedPrototype, { search: mixedSubset });
createUrl(typedTarget, { search: typedMixed });

const wrongConstructor = { q: 7, constructor: 42 };
const wrongToString = { q: 7, toString: "wrong" };
const wrongSubset = { q: 7, constructor: "logical", toString: "wrong" };
const wrongMultiple = { q: 7, constructor: 42, toString: "wrong" };
const wrongRequired = { q: "wrong", constructor: "logical" };

// @ts-expect-error Known own constructor values remain codec-typed through variables.
createUrl(mixedPrototype, { search: wrongConstructor });
// @ts-expect-error Known own toString values remain numeric through variables.
createUrl(mixedPrototype, { search: wrongToString });
// @ts-expect-error Selecting several optional names cannot hide a wrong supplied value.
createUrl(mixedPrototype, { search: wrongSubset });
// @ts-expect-error Multiple wrong supplied fields do not widen the selected target.
createUrl(mixedPrototype, { search: wrongMultiple });
// @ts-expect-error Required bindings still retain their codec type through a variable.
createUrl(mixedPrototype, { search: wrongRequired });

const ordinary = defineRoute("ordinary", { search: { q: numberParam } });
const structuralExtra = { q: 7, extra: "structural" };

// Normal variable excess-property behavior remains; runtime rejects unknown own keys.
createUrl(ordinary, { search: structuralExtra });
// @ts-expect-error The corresponding fresh literal still rejects unknown names.
createUrl(ordinary, { search: { q: 7, extra: "literal" } });
// @ts-expect-error Native constructor is also unknown when not declared by the target.
createUrl(ordinary, { search: { q: 7, constructor: () => undefined } });
// @ts-expect-error Native toString is also unknown when not declared by the target.
createUrl(ordinary, { search: { q: 7, toString: () => "wrong" } });
// @ts-expect-error Mixed required key still requires the search record.
createUrl(mixedPrototype, {});
// @ts-expect-error Mixed required key still requires its own binding.
createUrl(mixedPrototype, { search: {} });
// @ts-expect-error Mixed map retains ordinary value type checks.
createUrl(mixedPrototype, { search: { q: "wrong" } });
// @ts-expect-error Mixed inputs do not admit native Function values.
createUrl(mixedPrototype, { search: { q: 7, constructor: () => undefined } });
// @ts-expect-error Mixed inputs reject unknown literal keys.
createUrl(mixedPrototype, { search: { q: 7, extra: "wrong" } });
defineRoute("mixed-preserve", {
  search: { q: numberParam },
  redirect: { to: mixedPrototype, search: { mode: "preserve" }, fragment: { mode: "drop" } },
});
defineRoute("mixed-replace", {
  redirect: {
    to: mixedPrototype,
    search: { mode: "replace", values: { q: 7 } },
    fragment: { mode: "drop" },
  },
});
defineRoute("mixed-replace-wrong", {
  redirect: {
    to: mixedPrototype,
    // @ts-expect-error Optional prototype-named replacement remains codec-typed.
    search: { mode: "replace", values: { q: 7, toString: "wrong" } },
    fragment: { mode: "drop" },
  },
});

defineRoute("variable-empty-replace", {
  redirect: {
    to: prototypeOptional,
    search: { mode: "replace", values: emptySearch },
    fragment: { mode: "drop" },
  },
});
defineRoute("variable-partial-replace", {
  redirect: {
    to: prototypeOptional,
    search: { mode: "replace", values: partialToString },
    fragment: { mode: "drop" },
  },
});
defineRoute("variable-mixed-replace", {
  redirect: {
    to: mixedPrototype,
    search: { mode: "replace", values: mixedSubset },
    fragment: { mode: "drop" },
  },
});
defineRoute("variable-optional-subset-replace", {
  redirect: {
    to: prototypeOptional,
    search: { mode: "replace", values: optionalSubset },
    fragment: { mode: "drop" },
  },
});
defineRoute("variable-required-replace", {
  redirect: {
    to: mixedPrototype,
    search: { mode: "replace", values: mixedRequired },
    fragment: { mode: "drop" },
  },
});
defineRoute("variable-constructor-wrong", {
  redirect: {
    to: mixedPrototype,
    // @ts-expect-error Replacement variables cannot hide wrong own constructor values.
    search: { mode: "replace", values: wrongConstructor },
    fragment: { mode: "drop" },
  },
});
defineRoute("variable-tostring-wrong", {
  redirect: {
    to: mixedPrototype,
    // @ts-expect-error Replacement variables cannot hide wrong own toString values.
    search: { mode: "replace", values: wrongToString },
    fragment: { mode: "drop" },
  },
});
defineRoute("variable-subset-wrong", {
  redirect: {
    to: mixedPrototype,
    // @ts-expect-error Replacement subsets retain each supplied logical value type.
    search: { mode: "replace", values: wrongSubset },
    fragment: { mode: "drop" },
  },
});
defineRoute("variable-multiple-wrong", {
  redirect: {
    to: mixedPrototype,
    // @ts-expect-error Several wrong values cannot broaden the selected replacement schema.
    search: { mode: "replace", values: wrongMultiple },
    fragment: { mode: "drop" },
  },
});
defineRoute("variable-structural-replace", {
  redirect: {
    to: ordinary,
    search: { mode: "replace", values: structuralExtra },
    fragment: { mode: "drop" },
  },
});

defineRoute("mixed-drop", {
  // @ts-expect-error Required destination search cannot be dropped.
  redirect: { to: mixedPrototype, search: { mode: "drop" }, fragment: { mode: "drop" } },
});
defineRoute("mixed-missing", {
  redirect: {
    to: mixedPrototype,
    // @ts-expect-error Required replacement keys cannot be omitted.
    search: { mode: "replace", values: {} },
    fragment: { mode: "drop" },
  },
});
defineRoute("mixed-optional", {
  search: { q: optionalSearchParam(numberParam) },
  // @ts-expect-error Optional source q cannot guarantee required destination q.
  redirect: { to: mixedPrototype, search: { mode: "preserve" }, fragment: { mode: "drop" } },
});

const requiredConstructor = defineRoute("required-constructor", {
  search: { constructor: stringParam, toString: optionalSearchParam(numberParam) },
});

createUrl(requiredConstructor, { search: { constructor: "logical" } });
// @ts-expect-error Required prototype-named binding still requires a record.
createUrl(requiredConstructor, {});
// @ts-expect-error Required prototype-named binding cannot be omitted.
createUrl(requiredConstructor, { search: {} });
defineRoute("required-ctor-preserve", {
  search: { constructor: optionalSearchParam(stringParam) },
  // @ts-expect-error Optional prototype-named source cannot guarantee a required binding.
  redirect: { to: requiredConstructor, search: { mode: "preserve" }, fragment: { mode: "drop" } },
});

const undefinedCodec: ParamCodec<undefined> = {
  parse: () => undefined,
  stringify: () => "sentinel",
};

type BoxWithUndefined = { nested: { value: undefined; mutable: boolean } };

const undefinedBox: ParamCodec<BoxWithUndefined> = {
  parse: () => ({ nested: { value: undefined, mutable: true } }),
  stringify: () => "boxed",
};
const ownUndefined = defineRoute("own-undefined", {
  search: { q: undefinedCodec, box: undefinedBox },
  resolve: {
    local: ({ search }) => {
      exact<Equal<typeof search.q, undefined>>();
      exact<Equal<typeof search.box, BoxWithUndefined>>();
      search.box.nested.mutable = false;

      return search.q;
    },
  },
});

exact<Equal<NonNullable<typeof ownUndefined.__data>["local"], undefined>>();

const boxWithUndefined: BoxWithUndefined = { nested: { value: undefined, mutable: true } };

createUrl(ownUndefined, { search: { q: undefined, box: boxWithUndefined } });
createUrl(defineRoute("$id", { params: { id: undefinedCodec } }), { params: { id: undefined } });
defineRoute("undefined-replace", {
  redirect: {
    to: ownUndefined,
    search: { mode: "replace", values: { q: undefined, box: boxWithUndefined } },
    fragment: { mode: "drop" },
  },
});
// @ts-expect-error Undefined logical value does not make q optional.
createUrl(ownUndefined, { search: { box: boxWithUndefined } });
defineRoute("undefined-missing", {
  redirect: {
    to: ownUndefined,
    // @ts-expect-error Missing required replacement is still rejected.
    search: { mode: "replace", values: { box: boxWithUndefined } },
    fragment: { mode: "drop" },
  },
});
// @ts-expect-error Concrete undefined logical value is not a string.
createUrl(ownUndefined, { search: { q: "wrong", box: boxWithUndefined } });
createUrl(ownUndefined, {
  // @ts-expect-error Nested codec fields retain their concrete undefined type.
  search: { q: undefined, box: { nested: { value: "wrong", mutable: true } } },
});

// Invalid local path params: the route doesn't match unless its handler decides otherwise.
const invalidItem = defineRoute("invalid-items/$id", {
  params: { id: numberParam },
  onInvalidParams: (error, routeConfig, segments, partialSnapshot) => {
    exact<Equal<typeof error.source, "path">>();
    exact<Equal<typeof error.key, string>>();
    exact<Equal<typeof error.reason, "missing" | "repeated" | "invalid">>();
    exact<Equal<typeof error.cause, unknown>>();
    exact<Equal<typeof routeConfig, NativeRoute>>();
    exact<Equal<typeof segments, UrlSegment[]>>();
    exact<Equal<typeof partialSnapshot, PartialMatchRouteSnapshot>>();

    if (segments.length > 1) {
      return new RedirectCommand(new UrlTree());
    }

    if (segments.length > 0) {
      return of(new UrlTree());
    }

    return Promise.resolve(false as const);
  },
});

defineRoute("invalid-items/$id", { params: { id: numberParam }, onInvalidParams: () => false });
defineRoute("invalid-docs/$parts[]", {
  params: { parts: stringParam },
  onInvalidParams: async () => false as const,
});
// @ts-expect-error Invalid params can't match, so a handler can't return true.
defineRoute("invalid-true/$id", { params: { id: numberParam }, onInvalidParams: () => true });
defineRoute("invalid-boolean/$id", {
  params: { id: numberParam },
  // @ts-expect-error A boolean might be true.
  onInvalidParams: () => Math.random() > 0.5,
});
defineRoute("invalid-promise/$id", {
  params: { id: numberParam },
  // @ts-expect-error Asynchronous true is rejected too.
  onInvalidParams: async () => true,
});
// @ts-expect-error A paramless route has nothing to reject.
defineRoute("invalid-static", { onInvalidParams: () => false });
// @ts-expect-error Inherited params belong to the parent's own matching guard.
defineRoute("invalid-child", { parent: invalidItem, onInvalidParams: () => false });
defineRoute("invalid-redirect/$id", {
  params: { id: numberParam },
  redirect: { to: invalidItem, search: { mode: "drop" }, fragment: { mode: "drop" } },
  // @ts-expect-error Angular rejects canMatch on redirect records, so the handler has no guard.
  onInvalidParams: () => false,
});

// A fallback key always reads a value but may be omitted when writing a URL.
const paged = defineRoute("paged", {
  search: {
    page: optionalSearchParam(numberParam, { fallback: 1 }),
    sort: optionalSearchParam(enumParam(["asc", "desc"])),
    score: optionalSearchParam(nullableSearchParam(numberParam), { fallback: null }),
    q: stringParam,
  },
  resolve: {
    read: ({ search }) => {
      exact<Equal<typeof search.page, number>>();
      exact<Equal<typeof search.sort, "asc" | "desc" | undefined>>();
      exact<Equal<typeof search.score, number | null>>();
      exact<Equal<typeof search.q, string>>();

      return search.page;
    },
  },
  canMatch: [
    ({ search }) => {
      exact<Equal<typeof search.page, number>>();

      return true;
    },
  ],
});
type PagedSearch = NonNullable<typeof paged.__search>;

exact<Equal<PagedSearch["page"], number>>();
exact<Equal<PagedSearch["score"], number | null>>();
createUrl(paged, { search: { q: "x" } });
createUrl(paged, { search: { q: "x", page: 2, score: null, sort: "asc" } });
createUrl(paged, { search: { q: "x", page: undefined } });
// @ts-expect-error Fallback keys keep their codec type when supplied.
createUrl(paged, { search: { q: "x", page: "2" } });
// @ts-expect-error Plain required keys stay required.
createUrl(paged, { search: { page: 2 } });

const fallbackOnly = defineRoute("fallback-only", {
  search: { page: optionalSearchParam(numberParam, { fallback: 1 }) },
});

createUrl(fallbackOnly, {});
createUrl(fallbackOnly, { search: {} });
// @ts-expect-error The fallback has the codec's value type.
optionalSearchParam(numberParam, { fallback: "1" });
// @ts-expect-error An options record requires a fallback.
optionalSearchParam(numberParam, {});
// @ts-expect-error Fallback codecs are search-only.
defineRoute("$id", { params: { id: optionalSearchParam(numberParam, { fallback: 1 }) } });
// @ts-expect-error Nullable cannot wrap an optional search codec, fallback or not.
nullableSearchParam(optionalSearchParam(numberParam, { fallback: 1 }));

// Redirects: fallback keys are never required, on either side.
defineRoute("fallback-drop", {
  redirect: { to: fallbackOnly, search: { mode: "drop" }, fragment: { mode: "drop" } },
});
defineRoute("fallback-preserve", {
  redirect: { to: fallbackOnly, search: { mode: "preserve" }, fragment: { mode: "drop" } },
});
defineRoute("fallback-replace", {
  redirect: {
    to: paged,
    search: { mode: "replace", values: { q: "x" } },
    fragment: { mode: "drop" },
  },
});
defineRoute("fallback-replace-value", {
  redirect: {
    to: paged,
    search: { mode: "replace", values: { q: "x", page: 3 } },
    fragment: { mode: "drop" },
  },
});

const requiredPage = defineRoute("required-page", { search: { page: numberParam } });

defineRoute("fallback-source", {
  search: { page: optionalSearchParam(numberParam, { fallback: 1 }) },
  // @ts-expect-error A fallback source key may be absent from the URL it preserves.
  redirect: { to: requiredPage, search: { mode: "preserve" }, fragment: { mode: "drop" } },
});
// Children inherit the read and write shapes.
const pagedChild = defineRoute("child", { parent: fallbackOnly });

exact<Equal<NonNullable<typeof pagedChild.__search>["page"], number>>();
createUrl(pagedChild, {});
