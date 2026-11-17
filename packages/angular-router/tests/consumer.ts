import {
  defineRoute,
  createUrl,
  enumParam,
  numberParam,
  stringParam,
  booleanParam,
  withFallback,
  arrayParam,
  type Route,
  type ParamCodec,
} from "@loozo/angular-router";
import { defineDestination, routeOf } from "@loozo/angular-router/_core";
import type {
  ContributionOf,
  ExtensionSpec,
  FragmentsOf,
  InputContribution,
  ParamsOf,
  RouteFactory,
  RouteSchema,
  SearchOf,
  StepSignature,
  TargetOf,
  TitleOf,
  UrlValues,
} from "@loozo/angular-router/_core";
import type { ActiveRoute, Handle } from "@loozo/angular-router/_generated";
import type { Signal } from "@angular/core";
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
  search: { tab: enumParam(["details", "reviews"]) },
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
// @ts-expect-error Every search key is optional; the optional wrapper is gone.
import { optionalSearchParam as _optional } from "@loozo/angular-router";
// @ts-expect-error The nullable search wrapper is gone.
import { nullableSearchParam as _nullable } from "@loozo/angular-router";

const objectCodec: ParamCodec<{ label: string; count: number }> = {
  parse: (raw) => ({ label: raw, count: 1 }),
  stringify: (value) => value.label,
};
const parent = defineRoute("teams/$teamId", {
  params: { teamId: numberParam },
  search: {
    teamId: stringParam,
    flag: withFallback(booleanParam, false),
    box: objectCodec,
  },
  fragments: ["parent"],
}).resolve({ ancestor: () => 42 });
const layout = defineRoute("", { parent });
const localDataKey = Symbol("local data");
const symbolData = defineRoute("symbol", { parent: layout })
  .data({ [localDataKey]: { mutable: true } })
  .resolve({
    [localDataKey]: (inputs, snapshot, state) => {
      exact<Equal<typeof inputs.params.teamId, number>>();
      exact<Equal<typeof snapshot, ActivatedRouteSnapshot>>();
      exact<Equal<typeof state, RouterStateSnapshot>>();

      return "symbol value";
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
})
  .title((inputs, snapshot, state) => {
    exact<Equal<typeof inputs.params.teamId, number>>();
    exact<Equal<typeof inputs.params.id, { label: string; count: number }>>();
    exact<Equal<typeof inputs.search.teamId, string | undefined>>();
    exact<Equal<typeof snapshot, ActivatedRouteSnapshot>>();
    exact<Equal<typeof state, RouterStateSnapshot>>();

    return of(inputs.params.id.label);
  })
  .canDeactivate([nativeDeactivate])
  .runGuardsAndResolvers((from, to) => {
    exact<Equal<typeof from, ActivatedRouteSnapshot>>();
    exact<Equal<typeof to, ActivatedRouteSnapshot>>();

    return from !== to;
  })
  .canActivate([
    (inputs, snapshot, state) => {
      exact<Equal<typeof inputs.params.teamId, number>>();
      exact<Equal<typeof inputs.params.id, { label: string; count: number }>>();
      exact<Equal<typeof inputs.search.teamId, string | undefined>>();
      exact<Equal<typeof inputs.search.flag, boolean>>();
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
  ])
  .canActivateChild([
    ({ params }, snapshot, state) => {
      exact<Equal<typeof params.teamId, number>>();
      exact<Equal<typeof snapshot, ActivatedRouteSnapshot>>();
      exact<Equal<typeof state, RouterStateSnapshot>>();

      return of(redirected);
    },
  ])
  .canMatch([
    (inputs, routeConfig, segments, partialSnapshot) => {
      exact<Equal<typeof inputs.params.id, { label: string; count: number }>>();
      exact<Equal<typeof inputs.search.teamId, string | undefined>>();
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
  ])
  .resolve({
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
  });

type Data = NonNullable<typeof child.__data>;
exact<Equal<Data["local"], { label: string }>>();
exact<Equal<Data["promised"], { count: number }>>();
exact<Equal<Data["observed"], { visible: boolean }>>();
exact<Equal<Data["mixed"], { complete: boolean }>>();
exact<Equal<Data["redirect"], never>>();
exact<Equal<Data["promisedRedirect"], never>>();
exact<Equal<Data["observedRedirect"], never>>();
// Data includes ancestors' resolver results, here through the pathless layout.
exact<Equal<Data["ancestor"], number>>();
// @ts-expect-error No route in the chain resolves this key.
type _Missing = Data["missing"];

// A nearer resolver key hides an ancestor's; symbol keys survive inheritance.
const nearer = defineRoute("nearer", { parent: symbolData }).resolve({ ancestor: () => "nearer" });
type NearerData = NonNullable<typeof nearer.__data>;

exact<Equal<NearerData["ancestor"], string>>();
exact<Equal<NearerData[typeof localDataKey], string>>();
exact<Equal<keyof NearerData, "ancestor" | typeof localDataKey>>();

declare const nearerData: NearerData;
// @ts-expect-error Inherited data stays readonly.
nearerData[localDataKey] = "changed";

// A numeric key and its string spelling are one property, in either direction.
const numbered = defineRoute("numbered", {}).resolve({ 1: () => 123 });
const spelled = defineRoute("spelled", { parent: numbered }).resolve({ "1": () => "spelled" });
const renumbered = defineRoute("renumbered", { parent: spelled }).resolve({ 1: () => true });
type SpelledData = NonNullable<typeof spelled.__data>;
type RenumberedData = NonNullable<typeof renumbered.__data>;

exact<Equal<SpelledData["1"], string>>();
exact<Equal<RenumberedData[1], boolean>>();
exact<Equal<keyof RenumberedData, 1>>();
defineRoute("static-title", {}).title("Static");
defineRoute("promised-title", { parent }).title(async ({ params }) => `Team ${params.teamId}`);
// @ts-expect-error A title callback takes parsed inputs, not a snapshot-first native ResolveFn.
defineRoute("native-title", {}).title(nativeTitle);
// @ts-expect-error A title resolves to a string.
defineRoute("numeric-title", {}).title(() => 42);
// @ts-expect-error Search namespace does not permit inherited redeclaration.
defineRoute("again", { parent: layout, search: { teamId: numberParam } });
// @ts-expect-error Path namespace does not permit inherited redeclaration.
defineRoute("$teamId", { parent: layout, params: { teamId: numberParam } });
createUrl(child, {
  params: { teamId: 7, id: { label: "x", count: 1 } },
  search: { teamId: "q", flag: true },
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

// Parsing is synchronous: a codec whose parse returns a promise fails where it is declared.
const asyncCodec = {
  parse: async (raw: string) => raw,
  stringify: (value: string) => value,
};
const promisedCodec: ParamCodec<Promise<number>> = {
  parse: (raw) => Promise.resolve(Number(raw)),
  stringify: () => "promised",
};

// @ts-expect-error An async path codec is rejected.
defineRoute("async/$id", { params: { id: asyncCodec } });
// @ts-expect-error A promise-valued path codec is rejected.
defineRoute("promised/$id", { params: { id: promisedCodec } });
// @ts-expect-error An async catchall element codec is rejected.
defineRoute("async-docs/$parts[]", { params: { parts: asyncCodec } });
// @ts-expect-error An async search codec is rejected.
defineRoute("async-search", { search: { q: asyncCodec } });
// @ts-expect-error A promise-valued search codec is rejected.
defineRoute("promised-search", { search: { q: promisedCodec } });
// @ts-expect-error withFallback rejects a promise-valued codec.
withFallback(promisedCodec, Promise.resolve(1));

const arrayCodec: ParamCodec<readonly string[]> = {
  parse: (raw) => raw.split(","),
  stringify: (value) => value.join(","),
};
// Redirect targets are destinations, as destination.generated.ts files declare them.
const destination = defineDestination(
  "docs/$parts[]",
  { params: { parts: stringParam }, fragments: ["summary"] },
  "docs",
);

defineRoute("packed/$array", { params: { array: arrayCodec } }).redirect({
  to: destination,
  params: { parts: "array" },
  search: { mode: "drop" },
  fragment: { mode: "replace", value: "summary" },
});
defineRoute("$array", { params: { array: stringParam } }).redirect({
  to: destination,
  // @ts-expect-error Logical scalar string cannot feed a catchall string array.
  params: { parts: "array" },
  search: { mode: "drop" },
  fragment: { mode: "drop" },
});
defineRoute("$array", { params: { array: arrayCodec } }).redirect({
  to: destination,
  // @ts-expect-error Unknown mapping keys fail.
  params: { parts: "array", extra: "array" },
  search: { mode: "drop" },
  fragment: { mode: "drop" },
});
defineRoute("$parts[]", { params: { parts: stringParam } })
  .canMatch([])
  // @ts-expect-error A guard step rules a redirect out.
  .redirect({ to: destination, search: { mode: "drop" }, fragment: { mode: "drop" } });

// A translated destination, as a generated copy writes it: its text is a runtime value, while
// its id, path and params keep their canonical literal types.
declare const translatedText: string;
const translated = defineDestination(
  "products/$productId",
  { params: { productId: numberParam } },
  "src/routes/products/$productId/route.ts",
  [translatedText],
);
const translatedChild = defineDestination(
  "reviews",
  { parent: translated },
  "src/routes/products/$productId/reviews/route.ts",
  [translatedText],
);

const canonical = defineDestination(
  "products/$productId",
  { params: { productId: numberParam } },
  "src/routes/products/$productId/route.ts",
);
const canonicalChild = defineDestination(
  "reviews",
  { parent: canonical },
  "src/routes/products/$productId/reviews/route.ts",
);

exact<Equal<typeof translated, typeof canonical>>();
exact<Equal<typeof translatedChild, typeof canonicalChild>>();
createUrl(translatedChild, { params: { productId: 1 } });
// @ts-expect-error The canonical params stay required.
createUrl(translatedChild, {});

const root = defineDestination("", {}, "root");
const unknownReplacement = { extra: "x" };

defineRoute("alias", {}).redirect({
  to: root,
  // @ts-expect-error Searchless replacement variables cannot introduce keys.
  search: { mode: "replace", values: unknownReplacement },
  fragment: { mode: "drop" },
});
// @ts-expect-error Unknown input options fail.
createUrl(plain, { unexpected: true });

const invalidNative: MaybeAsync<GuardResult> = false;

void invalidNative;

const prototypeOptionalTo = defineDestination(
  "prototype-optional",
  {
    search: {
      constructor: stringParam,
      toString: numberParam,
      ["__proto__"]: enumParam(["one", "two"]),
    },
  },
  "prototype-optional",
);
const prototypeOptional = defineRoute("prototype-optional", {
  search: {
    constructor: stringParam,
    toString: numberParam,
    ["__proto__"]: enumParam(["one", "two"]),
  },
}).resolve({
  label: ({ search }) => {
    exact<Equal<typeof search.constructor, string | undefined>>();
    exact<Equal<typeof search.toString, number | undefined>>();
    exact<Equal<typeof search.__proto__, "one" | "two" | undefined>>();

    return search.constructor;
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
// @ts-expect-error A bare string is not URL values, even where String's search method could match.
createUrl(prototypeOptional, "x");
const notValues: readonly unknown[] = [];
const unrelatedValues = { unrelated: true };
// @ts-expect-error An array is not URL values.
createUrl(prototypeOptional, notValues);
// @ts-expect-error A function is not URL values.
createUrl(prototypeOptional, () => undefined);
// @ts-expect-error An unrelated object variable shares no URL-values key.
createUrl(prototypeOptional, unrelatedValues);
// Typed URL values stay a plain record for record-constrained helpers.
const recordRoute = defineRoute("record", { search: { q: stringParam } });
const typedValues: UrlValues<typeof recordRoute> = { search: { q: "x" } };
const forwardRecord = <Values extends Record<string, unknown>>(values: Values): Values => values;
createUrl(recordRoute, forwardRecord(typedValues));
// @ts-expect-error Computed prototype key retains its enum union.
createUrl(prototypeOptional, { search: { ["__proto__"]: "other" } });

const prototypeText = stringParam;
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

const onlyConstructorTo = defineDestination(
  "only-constructor",
  { search: { constructor: stringParam } },
  "only-constructor",
);
const onlyConstructor = defineRoute("only-constructor", {
  search: { constructor: stringParam },
});
const onlyToString = defineRoute("only-tostring", {
  search: { toString: stringParam },
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

defineRoute("prototype-drop", {}).redirect({
  to: prototypeOptionalTo,
  search: { mode: "drop" },
  fragment: { mode: "drop" },
});
defineRoute("prototype-preserve", {}).redirect({
  to: prototypeOptionalTo,
  search: { mode: "preserve" },
  fragment: { mode: "drop" },
});
defineRoute("prototype-replace", {}).redirect({
  to: prototypeOptionalTo,
  search: { mode: "replace", values: {} },
  fragment: { mode: "drop" },
});
defineRoute("constructor-replace", {}).redirect({
  to: onlyConstructorTo,
  search: { mode: "replace", values: {} },
  fragment: { mode: "drop" },
});

defineRoute("prototype-replace-wrong", {}).redirect({
  to: prototypeOptionalTo,
  // @ts-expect-error Replacement inputs retain logical prototype-named value types.
  search: { mode: "replace", values: { constructor: () => undefined } },
  fragment: { mode: "drop" },
});

const mixedPrototypeTo = defineDestination(
  "prototype-mixed",
  { search: { q: numberParam, constructor: stringParam, toString: numberParam } },
  "prototype-mixed",
);
const mixedPrototype = defineRoute("prototype-mixed", {
  search: {
    q: numberParam,
    constructor: stringParam,
    toString: numberParam,
  },
}).canActivate([
  ({ search }) => {
    exact<Equal<typeof search.q, number | undefined>>();
    exact<Equal<typeof search.constructor, string | undefined>>();
    exact<Equal<typeof search.toString, number | undefined>>();

    return true;
  },
]);

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
  { readonly q?: number; readonly constructor?: string; readonly toString?: number }
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
// @ts-expect-error Supplied bindings retain their codec type through a variable.
createUrl(mixedPrototype, { search: wrongRequired });

const ordinaryTo = defineDestination("ordinary", { search: { q: numberParam } }, "ordinary");
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
// Every search key may be omitted.
createUrl(mixedPrototype, {});
createUrl(mixedPrototype, { search: {} });
createUrl(mixedPrototype, { search: { q: undefined } });
// @ts-expect-error Mixed map retains ordinary value type checks.
createUrl(mixedPrototype, { search: { q: "wrong" } });
// @ts-expect-error Mixed inputs do not admit native Function values.
createUrl(mixedPrototype, { search: { q: 7, constructor: () => undefined } });
// @ts-expect-error Mixed inputs reject unknown literal keys.
createUrl(mixedPrototype, { search: { q: 7, extra: "wrong" } });
defineRoute("mixed-preserve", { search: { q: numberParam } }).redirect({
  to: mixedPrototypeTo,
  search: { mode: "preserve" },
  fragment: { mode: "drop" },
});
defineRoute("mixed-replace", {}).redirect({
  to: mixedPrototypeTo,
  search: { mode: "replace", values: { q: 7 } },
  fragment: { mode: "drop" },
});
defineRoute("mixed-replace-wrong", {}).redirect({
  to: mixedPrototypeTo,
  // @ts-expect-error Optional prototype-named replacement remains codec-typed.
  search: { mode: "replace", values: { q: 7, toString: "wrong" } },
  fragment: { mode: "drop" },
});

defineRoute("variable-empty-replace", {}).redirect({
  to: prototypeOptionalTo,
  search: { mode: "replace", values: emptySearch },
  fragment: { mode: "drop" },
});
defineRoute("variable-partial-replace", {}).redirect({
  to: prototypeOptionalTo,
  search: { mode: "replace", values: partialToString },
  fragment: { mode: "drop" },
});
defineRoute("variable-mixed-replace", {}).redirect({
  to: mixedPrototypeTo,
  search: { mode: "replace", values: mixedSubset },
  fragment: { mode: "drop" },
});
defineRoute("variable-optional-subset-replace", {}).redirect({
  to: prototypeOptionalTo,
  search: { mode: "replace", values: optionalSubset },
  fragment: { mode: "drop" },
});
defineRoute("variable-required-replace", {}).redirect({
  to: mixedPrototypeTo,
  search: { mode: "replace", values: mixedRequired },
  fragment: { mode: "drop" },
});
defineRoute("variable-constructor-wrong", {}).redirect({
  to: mixedPrototypeTo,
  // @ts-expect-error Replacement variables cannot hide wrong own constructor values.
  search: { mode: "replace", values: wrongConstructor },
  fragment: { mode: "drop" },
});
defineRoute("variable-tostring-wrong", {}).redirect({
  to: mixedPrototypeTo,
  // @ts-expect-error Replacement variables cannot hide wrong own toString values.
  search: { mode: "replace", values: wrongToString },
  fragment: { mode: "drop" },
});
defineRoute("variable-subset-wrong", {}).redirect({
  to: mixedPrototypeTo,
  // @ts-expect-error Replacement subsets retain each supplied logical value type.
  search: { mode: "replace", values: wrongSubset },
  fragment: { mode: "drop" },
});
defineRoute("variable-multiple-wrong", {}).redirect({
  to: mixedPrototypeTo,
  // @ts-expect-error Several wrong values cannot broaden the selected replacement schema.
  search: { mode: "replace", values: wrongMultiple },
  fragment: { mode: "drop" },
});
defineRoute("variable-structural-replace", {}).redirect({
  to: ordinaryTo,
  search: { mode: "replace", values: structuralExtra },
  fragment: { mode: "drop" },
});

// No destination search key is required, so every policy accepts any target.
defineRoute("mixed-drop", {}).redirect({
  to: mixedPrototypeTo,
  search: { mode: "drop" },
  fragment: { mode: "drop" },
});
defineRoute("mixed-missing", {}).redirect({
  to: mixedPrototypeTo,
  search: { mode: "replace", values: {} },
  fragment: { mode: "drop" },
});
defineRoute("mixed-preserve-searchless", {}).redirect({
  to: mixedPrototypeTo,
  search: { mode: "preserve" },
  fragment: { mode: "drop" },
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
const ownUndefinedTo = defineDestination(
  "own-undefined",
  { search: { q: undefinedCodec, box: undefinedBox } },
  "own-undefined",
);
const ownUndefined = defineRoute("own-undefined", {
  search: { q: undefinedCodec, box: undefinedBox },
}).resolve({
  local: ({ search }) => {
    exact<Equal<typeof search.q, undefined>>();
    exact<Equal<typeof search.box, BoxWithUndefined | undefined>>();

    if (search.box) {
      search.box.nested.mutable = false;
    }

    return search.q;
  },
});

exact<Equal<NonNullable<typeof ownUndefined.__data>["local"], undefined>>();

const boxWithUndefined: BoxWithUndefined = { nested: { value: undefined, mutable: true } };

createUrl(ownUndefined, { search: { q: undefined, box: boxWithUndefined } });
createUrl(defineRoute("$id", { params: { id: undefinedCodec } }), { params: { id: undefined } });
defineRoute("undefined-replace", {}).redirect({
  to: ownUndefinedTo,
  search: { mode: "replace", values: { q: undefined, box: boxWithUndefined } },
  fragment: { mode: "drop" },
});
createUrl(ownUndefined, { search: { box: boxWithUndefined } });
// @ts-expect-error Concrete undefined logical value is not a string.
createUrl(ownUndefined, { search: { q: "wrong", box: boxWithUndefined } });
createUrl(ownUndefined, {
  // @ts-expect-error Nested codec fields retain their concrete undefined type.
  search: { q: undefined, box: { nested: { value: "wrong", mutable: true } } },
});

// Invalid local path params: the route doesn't match unless its handler decides otherwise.
const invalidItemTo = defineDestination(
  "invalid-items/$id",
  { params: { id: numberParam } },
  "invalid-items",
);
const invalidItem = defineRoute("invalid-items/$id", {
  params: { id: numberParam },
}).onInvalidParams((error, routeConfig, segments, partialSnapshot) => {
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
});

defineRoute("invalid-items/$id", { params: { id: numberParam } }).onInvalidParams(() => false);
defineRoute("invalid-docs/$parts[]", { params: { parts: stringParam } }).onInvalidParams(
  async () => false as const,
);
// @ts-expect-error Invalid params can't match, so a handler can't return true.
defineRoute("invalid-true/$id", { params: { id: numberParam } }).onInvalidParams(() => true);
defineRoute("invalid-boolean/$id", { params: { id: numberParam } })
  // @ts-expect-error A boolean might be true.
  .onInvalidParams(() => Math.random() > 0.5);
defineRoute("invalid-promise/$id", { params: { id: numberParam } })
  // @ts-expect-error Asynchronous true is rejected too.
  .onInvalidParams(async () => true);
// @ts-expect-error A paramless route has nothing to reject.
defineRoute("invalid-static", {}).onInvalidParams(() => false);
// @ts-expect-error Inherited params belong to the parent's own matching guard.
defineRoute("invalid-child", { parent: invalidItem }).onInvalidParams(() => false);
defineRoute("invalid-redirect/$id", { params: { id: numberParam } })
  .onInvalidParams(() => false)
  // @ts-expect-error Angular rejects canMatch on redirect records, so the handler has no guard.
  .redirect({ to: invalidItemTo, search: { mode: "drop" }, fragment: { mode: "drop" } });

// A plain search key reads as optional; a fallback key always reads a value.
// Either may be omitted, or passed as undefined, when writing a URL.
const pagedTo = defineDestination(
  "paged",
  {
    search: {
      page: withFallback(numberParam, 1),
      sort: enumParam(["asc", "desc"]),
      score: withFallback(numberParam, 0),
      q: stringParam,
    },
  },
  "paged",
);
const paged = defineRoute("paged", {
  search: {
    page: withFallback(numberParam, 1),
    sort: enumParam(["asc", "desc"]),
    score: withFallback(numberParam, 0),
    q: stringParam,
  },
})
  .resolve({
    read: ({ search }) => {
      exact<Equal<typeof search.page, number>>();
      exact<Equal<typeof search.sort, "asc" | "desc" | undefined>>();
      exact<Equal<typeof search.score, number>>();
      exact<Equal<typeof search.q, string | undefined>>();

      return search.page;
    },
  })
  .canMatch([
    ({ search }) => {
      exact<Equal<typeof search.page, number>>();

      return true;
    },
  ]);
type PagedSearch = NonNullable<typeof paged.__search>;

exact<Equal<PagedSearch["page"], number>>();
exact<Equal<PagedSearch["q"], string | undefined>>();
createUrl(paged, {});
createUrl(paged, { search: {} });
createUrl(paged, { search: { q: "x" } });
createUrl(paged, { search: { q: "x", page: 2, score: 3, sort: "asc" } });
createUrl(paged, { search: { q: undefined, page: undefined } });
// @ts-expect-error Fallback keys keep their codec type when supplied.
createUrl(paged, { search: { q: "x", page: "2" } });
// @ts-expect-error Plain keys keep their codec type when supplied.
createUrl(paged, { search: { q: 2 } });
// @ts-expect-error Unknown search keys fail.
createUrl(paged, { search: { other: 2 } });

const fallbackOnlyTo = defineDestination(
  "fallback-only",
  { search: { page: withFallback(numberParam, 1) } },
  "fallback-only",
);
const fallbackOnly = defineRoute("fallback-only", {
  search: { page: withFallback(numberParam, 1) },
});

createUrl(fallbackOnly, {});
createUrl(fallbackOnly, { search: {} });
// @ts-expect-error The fallback has the codec's value type.
withFallback(numberParam, "1");
// @ts-expect-error A fallback is required.
withFallback(numberParam);
// @ts-expect-error Fallback codecs are search-only.
defineRoute("$id", { params: { id: withFallback(numberParam, 1) } });
// @ts-expect-error Fallback codecs are search-only, catchall elements included.
defineRoute("fallback-docs/$parts[]", { params: { parts: withFallback(stringParam, "") } });

// Redirects: no search key is ever required, on either side.
defineRoute("fallback-drop", {}).redirect({
  to: fallbackOnlyTo,
  search: { mode: "drop" },
  fragment: { mode: "drop" },
});
defineRoute("fallback-preserve", {}).redirect({
  to: fallbackOnlyTo,
  search: { mode: "preserve" },
  fragment: { mode: "drop" },
});
defineRoute("fallback-replace", {}).redirect({
  to: pagedTo,
  search: { mode: "replace", values: { q: "x" } },
  fragment: { mode: "drop" },
});
defineRoute("fallback-replace-value", {}).redirect({
  to: pagedTo,
  search: { mode: "replace", values: { q: "x", page: 3, score: undefined } },
  fragment: { mode: "drop" },
});
defineRoute("fallback-replace-wrong", {}).redirect({
  to: pagedTo,
  // @ts-expect-error Replacement values keep their codec type.
  search: { mode: "replace", values: { page: "3" } },
  fragment: { mode: "drop" },
});
// Children inherit the read and write shapes.
const pagedChild = defineRoute("child", { parent: fallbackOnly });

exact<Equal<NonNullable<typeof pagedChild.__search>["page"], number>>();
createUrl(pagedChild, {});

// The generated handle exposes readonly Signals of the committed snapshot, not Resources.
declare const pagedHandle: Handle<typeof paged>;
declare const childHandle: Handle<typeof child>;
const pagedSearch: Signal<Readonly<PagedSearch>> = pagedHandle.search;

exact<Equal<ReturnType<typeof pagedHandle.search>["page"], number>>();
exact<Equal<ReturnType<typeof pagedHandle.search>["sort"], "asc" | "desc" | undefined>>();
exact<Equal<ReturnType<typeof childHandle.params>["teamId"], number>>();
exact<Equal<ReturnType<typeof childHandle.data>["local"], { label: string }>>();
exact<Equal<ReturnType<typeof childHandle.data>["ancestor"], number>>();
void pagedSearch;
// @ts-expect-error A Signal has no Resource value().
void pagedHandle.params.value();
// @ts-expect-error The signals are not writable.
pagedHandle.search.set({ page: 1, score: 0 });
declare const otherData: typeof pagedHandle.data;
// @ts-expect-error The handle's signal properties are readonly.
pagedHandle.data = otherData;

// An array key always reads a readonly array; writing it is optional, and the
// guards, resolvers, children and handle all see the same shape.
const articlesTo = defineDestination(
  "articles",
  { search: { tag: arrayParam(enumParam(["news", "guides"])), single: stringParam } },
  "articles",
);
const articles = defineRoute("articles", {
  search: { tag: arrayParam(enumParam(["news", "guides"])), single: stringParam },
}).resolve({
  read: ({ search }) => {
    exact<Equal<typeof search.tag, readonly ("news" | "guides")[]>>();
    exact<Equal<typeof search.single, string | undefined>>();

    return search.tag;
  },
});
type ArticlesSearch = NonNullable<typeof articles.__search>;
declare const articlesHandle: Handle<typeof articles>;

exact<Equal<ArticlesSearch["tag"], readonly ("news" | "guides")[]>>();
exact<Equal<ReturnType<typeof articlesHandle.search>["tag"], readonly ("news" | "guides")[]>>();
const articlesChild = defineRoute("child", { parent: articles });

exact<Equal<NonNullable<typeof articlesChild.__search>["tag"], readonly ("news" | "guides")[]>>();
createUrl(articles, {});
createUrl(articles, { search: { tag: [] } });
createUrl(articles, { search: { tag: ["news", "news"], single: "x" } });
createUrl(articles, { search: { tag: undefined } });
const tags: readonly "guides"[] = ["guides"];
createUrl(articles, { search: { tag: tags } });
articlesHandle.link({ search: { tag: ["guides"] } });
void articlesHandle.navigate({ search: { tag: [] } });
// @ts-expect-error An array key takes an array, not one value.
createUrl(articles, { search: { tag: "news" } });
// @ts-expect-error Each element keeps the codec's type.
createUrl(articles, { search: { tag: ["other"] } });
// @ts-expect-error The handle writes the same shape.
articlesHandle.link({ search: { tag: "news" } });
// @ts-expect-error Array codecs are search-only.
defineRoute("array/$id", { params: { id: arrayParam(numberParam) } });
// @ts-expect-error Array codecs are search-only, catchall elements included.
defineRoute("array-docs/$parts[]", { params: { parts: arrayParam(stringParam) } });
// @ts-expect-error An array key takes no fallback.
withFallback(arrayParam(numberParam), [1]);
// @ts-expect-error An array codec can't wrap a fallback.
arrayParam(withFallback(numberParam, 1));
// @ts-expect-error An array codec can't wrap another one.
arrayParam(arrayParam(numberParam));
// @ts-expect-error A promise-valued element codec fails where it is declared.
arrayParam(promisedCodec);
defineRoute("articles-replace", {}).redirect({
  to: articlesTo,
  search: { mode: "replace", values: { tag: ["news"], single: undefined } },
  fragment: { mode: "drop" },
});
defineRoute("articles-replace-empty", {}).redirect({
  to: articlesTo,
  search: { mode: "replace", values: { tag: [] } },
  fragment: { mode: "drop" },
});
defineRoute("articles-replace-wrong", {}).redirect({
  to: articlesTo,
  // @ts-expect-error Replacement values keep the array shape.
  search: { mode: "replace", values: { tag: "news" } },
  fragment: { mode: "drop" },
});

// Steps: each at most once, in any order; a used step is gone from the value.
const once = defineRoute("once/$id", { params: { id: numberParam } });
const redirectTarget = defineDestination("redirect-target", {}, "redirect-target");
const drop = { to: redirectTarget, search: { mode: "drop" }, fragment: { mode: "drop" } } as const;
// @ts-expect-error canMatch is used.
once.canMatch([]).canMatch([]);
// @ts-expect-error canActivate is used.
once.canActivate([]).canActivate([]);
// @ts-expect-error canActivateChild is used.
once.canActivateChild([]).canActivateChild([]);
// @ts-expect-error canDeactivate is used.
once.canDeactivate([]).canDeactivate([]);
// @ts-expect-error resolve is used.
once.resolve({}).resolve({});
// @ts-expect-error title is used.
once.title("a").title("b");
// @ts-expect-error providers is used.
once.providers([]).providers([]);
// @ts-expect-error data is used.
once.data({}).data({});
// @ts-expect-error runGuardsAndResolvers is used.
once.runGuardsAndResolvers("always").runGuardsAndResolvers("always");
// @ts-expect-error onInvalidParams is used.
once.onInvalidParams(() => false).onInvalidParams(() => false);
// @ts-expect-error redirect is used, and nothing follows it.
once.redirect(drop).redirect(drop);
// @ts-expect-error No step follows a redirect.
once.redirect(drop).title("after");
// @ts-expect-error A guard step rules a redirect out: canMatch.
once.canMatch([]).redirect(drop);
// @ts-expect-error A guard step rules a redirect out: canActivate.
once.canActivate([]).redirect(drop);
// @ts-expect-error A guard step rules a redirect out: canActivateChild.
once.canActivateChild([]).redirect(drop);
// @ts-expect-error A guard step rules a redirect out: canDeactivate.
once.canDeactivate([]).redirect(drop);
// @ts-expect-error onInvalidParams rules a redirect out.
once.onInvalidParams(() => false).redirect(drop);
// Steps that don't guard may precede a redirect.
once.resolve({}).title("t").data({}).providers([]).runGuardsAndResolvers("always").redirect(drop);
// Order is free.
once
  .title("t")
  .canActivate([])
  .resolve({ value: () => 1 });

// A used step's method is gone, even through a plain callback type.
const ended = defineRoute("ended", {}).title("a");
// @ts-expect-error title is no longer offered.
const reuseTitle: (title: string) => unknown = ended.title;
void reuseTitle;

// @ts-expect-error Behavior goes in chained steps, not in URL facts.
defineRoute("facts-only", { title: "no" });
// @ts-expect-error Resolvers go in chained steps, not in URL facts.
defineRoute("facts-only-resolve", { resolve: {} });

// A parent ending in a data or rerun step passes its data on; generated consumers read
// the method-free projection.
const dataParent = defineRoute("data-parent", {})
  .resolve({ value: () => 1 })
  .runGuardsAndResolvers("always");
const dataChild = defineRoute("data-child/$slug", {
  parent: dataParent,
  params: { slug: stringParam },
})
  .resolve({ label: () => "label" })
  .title("child");

exact<Equal<NonNullable<typeof dataChild.__data>["value"], number>>();
exact<Equal<NonNullable<typeof dataChild.__data>["label"], string>>();
exact<
  Equal<
    RouteSchema<typeof dataChild>,
    Route<
      "data-child/$slug",
      NonNullable<typeof dataChild.__params>,
      NonNullable<typeof dataChild.__search>,
      { label: () => string },
      never,
      false,
      NonNullable<typeof dataChild.__data>,
      string
    >
  >
>();

// Destinations and route copies, written by hand exactly as destination.generated.ts and
// route.generated.ts declare them, against the equivalent authored chains.
type DataOf<Target> = Target extends { readonly __data?: infer Data } ? Data : never;

const tabCodec = withFallback(enumParam(["a", "b"]), "a");
const authoredOrg = defineRoute("orgs/$orgId", {
  params: { orgId: numberParam },
  search: { tab: tabCodec },
})
  .resolve({ orgData: ({ params }) => `org-${params.orgId}` })
  .title("Org");
const authoredPathless = defineRoute("", { parent: authoredOrg }).resolve({
  group: () => "pathless-data",
});
const authoredLeaf = defineRoute("items/$itemId", {
  parent: authoredPathless,
  params: { itemId: numberParam },
  search: { q: numberParam },
  fragments: ["detail"],
})
  .canActivate([({ params, search }) => params.orgId > 0 && search.tab === "a"])
  .resolve({ answer: ({ params }) => params.itemId * 2 })
  .title(({ params }) => `Item ${params.itemId}`);
const authoredDocs = defineRoute("docs/$rest[]", {
  params: { rest: stringParam },
  fragments: ["top"],
}).title(({ params }) => params.rest.join("/"));

const orgDestination = defineDestination(
  "orgs/$orgId",
  { params: { orgId: numberParam }, search: { tab: tabCodec } },
  "src/routes/org/route.ts",
);
const pathlessDestination = defineDestination(
  "",
  { parent: orgDestination },
  "src/routes/org/pathless/route.ts",
);
const leafDestination = defineDestination(
  "items/$itemId",
  {
    parent: pathlessDestination,
    params: { itemId: numberParam },
    search: { q: numberParam },
    fragments: ["detail"],
  },
  "src/routes/org/pathless/leaf/route.ts",
);
const docsDestination = defineDestination(
  "docs/$rest[]",
  { params: { rest: stringParam }, fragments: ["top"] },
  "src/routes/docs/route.ts",
);
const orgCopy = routeOf(defineRoute, orgDestination)
  .resolve({ orgData: ({ params }) => `org-${params.orgId}` })
  .title("Org");
const pathlessCopy = routeOf(defineRoute, pathlessDestination, orgCopy).resolve({
  group: () => "pathless-data",
});
const leafCopy = routeOf(defineRoute, leafDestination, pathlessCopy)
  .canActivate([({ params, search }) => params.orgId > 0 && search.tab === "a"])
  .resolve({ answer: ({ params }) => params.itemId * 2 })
  .title(({ params }) => `Item ${params.itemId}`);
const docsCopy = routeOf(defineRoute, docsDestination).title(({ params }) => params.rest.join("/"));

// A copy types exactly like the authored chain: inherited params, fallback search, data, title, fragments.
exact<Equal<ParamsOf<typeof leafCopy>, ParamsOf<typeof authoredLeaf>>>();
exact<Equal<SearchOf<typeof leafCopy>, SearchOf<typeof authoredLeaf>>>();
exact<Equal<DataOf<typeof leafCopy>, DataOf<typeof authoredLeaf>>>();
exact<Equal<TitleOf<typeof leafCopy>, TitleOf<typeof authoredLeaf>>>();
exact<Equal<FragmentsOf<typeof leafCopy>, FragmentsOf<typeof authoredLeaf>>>();
exact<Equal<ParamsOf<typeof pathlessCopy>, ParamsOf<typeof authoredPathless>>>();
exact<Equal<DataOf<typeof pathlessCopy>, DataOf<typeof authoredPathless>>>();
exact<Equal<ParamsOf<typeof docsCopy>, ParamsOf<typeof authoredDocs>>>();
// A destination's target carries the authored route's URL schema.
exact<Equal<ParamsOf<TargetOf<typeof leafDestination>>, ParamsOf<typeof authoredLeaf>>>();
exact<Equal<SearchOf<TargetOf<typeof leafDestination>>, SearchOf<typeof authoredLeaf>>>();
exact<Equal<FragmentsOf<TargetOf<typeof leafDestination>>, "detail">>();
exact<Equal<ParamsOf<TargetOf<typeof docsDestination>>, ParamsOf<typeof authoredDocs>>>();
exact<Equal<FragmentsOf<TargetOf<typeof docsDestination>>, "top">>();
exact<Equal<TargetOf<typeof authoredLeaf>, undefined>>();
// A destination is not a route: the bare extractors don't read it.
exact<Equal<ParamsOf<typeof leafDestination>, {}>>();

// createUrl takes a destination, a route copy or an inline declaration.
createUrl(leafDestination, {
  params: { orgId: 1, itemId: 2 },
  search: { q: 3, tab: "b" },
  fragment: "detail",
});
createUrl(leafCopy, { params: { orgId: 1, itemId: 2 }, fragment: "detail" });
createUrl(orgDestination, { params: { orgId: 1 }, search: { tab: "a" } });
createUrl(pathlessDestination, { params: { orgId: 1 } });
createUrl(docsDestination, { params: { rest: ["a", "b"] }, fragment: "top" });
createUrl(docsDestination, { params: { rest: [] } });
createUrl(authoredLeaf, { params: { orgId: 1, itemId: 2 } });
// @ts-expect-error A missing inherited param.
createUrl(leafDestination, { params: { itemId: 2 } });
// @ts-expect-error Another route's fragment.
createUrl(leafDestination, { params: { orgId: 1, itemId: 2 }, fragment: "top" });
// @ts-expect-error A catchall takes an array.
createUrl(docsDestination, { params: { rest: "a" } });
// @ts-expect-error The enum's values.
createUrl(orgDestination, { params: { orgId: 1 }, search: { tab: "c" } });
// @ts-expect-error A structural fake is neither a route nor a destination.
createUrl({ path: "x" }, {});
// @ts-expect-error A pathless destination takes only the params it inherits.
createUrl(pathlessDestination, { params: { orgId: 1, itemId: 2 } });

// Admission: routes and destinations don't stand in for each other.
// @ts-expect-error A catchall destination can't have children.
defineDestination("x", { parent: docsDestination }, "x");
// @ts-expect-error A destination is not a route's parent.
defineRoute("x", { parent: leafDestination });
// @ts-expect-error A route is not a destination's parent.
defineDestination("x", { parent: authoredLeaf }, "x");
// @ts-expect-error An inherited key can't be redeclared.
defineDestination("y/$orgId", { parent: orgDestination, params: { orgId: numberParam } }, "y");
// @ts-expect-error A route copy is not a destination.
routeOf(defineRoute, leafCopy);
// @ts-expect-error A destination is not a parent copy.
routeOf(defineRoute, leafDestination, pathlessDestination);

// `..` is typed from the generated parent destination; a destination `to` from itself.
declare const leafHandle: Handle<typeof leafCopy, typeof pathlessDestination>;
declare const docsHandle: Handle<typeof docsCopy, typeof orgDestination>;
declare const orgHandle: Handle<typeof orgCopy>;
const twin = defineDestination(
  "orgs/$orgId",
  { params: { orgId: numberParam }, search: { tab: tabCodec } },
  "other",
);
declare const either: typeof orgDestination | typeof twin;

exact<Equal<ReturnType<typeof leafHandle.params>, Readonly<ParamsOf<typeof authoredLeaf>>>>();
exact<Equal<ReturnType<typeof leafHandle.search>["tab"], "a" | "b">>();
exact<Equal<ReturnType<typeof leafHandle.data>["orgData"], string>>();
exact<Equal<ReturnType<typeof leafHandle.data>["group"], string>>();
exact<Equal<ReturnType<typeof leafHandle.data>["answer"], number>>();
exact<Equal<ReturnType<typeof leafHandle.title>, string>>();
exact<Equal<ParamsOf<TargetOf<typeof twin>>, ParamsOf<TargetOf<typeof orgDestination>>>>();
leafHandle.link({ to: "..", params: { orgId: 1 } });
leafHandle.link({ to: "..", params: { orgId: 1 }, search: { tab: "b" } });
leafHandle.link({ params: { orgId: 1, itemId: 2 }, fragment: "detail" });
leafHandle.link({ to: docsDestination, params: { rest: ["x"] }, fragment: "top" });
void leafHandle.navigate({ to: orgDestination, params: { orgId: 3 }, replaceUrl: true });
void leafHandle.navigate({ to: "..", params: { orgId: 3 }, replaceUrl: true });
docsHandle.link({ to: "..", params: { orgId: 1 } });
// @ts-expect-error `..` is the pathless parent: it has no itemId.
leafHandle.link({ to: "..", params: { orgId: 1, itemId: 2 } });
// @ts-expect-error `..` needs the parent's params.
leafHandle.link({ to: ".." });
// @ts-expect-error A destination's values are checked.
leafHandle.link({ to: docsDestination, params: { rest: "x" } });
// @ts-expect-error A route copy is not a destination.
leafHandle.link({ to: leafCopy, params: { orgId: 1, itemId: 2 } });
// @ts-expect-error No string selectors: only a destination, `..` or omitted.
leafHandle.link({ to: "/orgs/$orgId", params: { orgId: 1 } });
// @ts-expect-error Without a generated `..` target there is no `..` overload.
orgHandle.link({ to: ".." });
// @ts-expect-error A union of two destinations is ambiguous, even with identical schemas.
orgHandle.link({ to: either, params: { orgId: 1 } });

// The active route over RouteTypes, written by hand exactly as routes.generated.ts declares it.
type RouteTypes = {
  "src/routes/org/route.ts": { schema: RouteSchema<typeof orgCopy> };
  "src/routes/org/pathless/leaf/route.ts": {
    schema: RouteSchema<typeof leafCopy>;
    up: typeof pathlessDestination;
  };
};
declare const active: ActiveRoute<RouteTypes>;

if (active.is(leafDestination)) {
  exact<Equal<ReturnType<typeof active.data>["answer"], number>>();
  exact<Equal<ReturnType<typeof active.data>["orgData"], string>>();
  exact<Equal<ReturnType<typeof active.title>, string>>();
  active.link({ to: "..", params: { orgId: 1 } });
  void active.navigate({ params: { orgId: 1, itemId: 2 }, replaceUrl: true });
  // @ts-expect-error Data keys are the route's resolver keys.
  void active.data().unknown;
}

exact<
  Equal<ReturnType<NonNullable<ReturnType<typeof active.chain.find>>["params"]>["orgId"], number>
>();
exact<
  Equal<
    ReturnType<NonNullable<ReturnType<typeof findOrg>>["params"]>,
    Readonly<ParamsOf<typeof authoredOrg>>
  >
>();
function findOrg() {
  return active.chain.find((route) => route.is(orgDestination));
}
exact<Equal<ReturnType<typeof active.contains>, boolean>>();
// @ts-expect-error link needs is() first.
active.link({ params: { orgId: 1 } });
// @ts-expect-error A destination outside RouteTypes is not one of this tree's routes.
active.is(docsDestination);

// `.redirect` takes a destination and is typed from it.
const oldDestination = defineDestination(
  "old/$orgId/$itemId",
  { params: { orgId: numberParam, itemId: numberParam } },
  "src/routes/old/route.ts",
);
const oldCopy = routeOf(defineRoute, oldDestination).redirect({
  to: leafDestination,
  search: { mode: "replace", values: { q: 7 } },
  fragment: { mode: "replace", value: "detail" },
});

exact<Equal<ParamsOf<typeof oldCopy>, { readonly orgId: number; readonly itemId: number }>>();
defineRoute("o/$orgId/$itemId", { params: { orgId: numberParam, itemId: numberParam } }).redirect({
  to: leafDestination,
  search: { mode: "drop" },
  fragment: { mode: "replace", value: "detail" },
});
defineRoute("o/$orgId/$itemId", { params: { orgId: numberParam, itemId: numberParam } }).redirect({
  to: leafDestination,
  search: { mode: "drop" },
  // @ts-expect-error An unknown target fragment.
  fragment: { mode: "replace", value: "top" },
});
defineRoute("o/$orgId/$itemId", { params: { orgId: numberParam, itemId: numberParam } }).redirect({
  to: leafDestination,
  // @ts-expect-error Replacement values are typed from the destination.
  search: { mode: "replace", values: { q: "x" } },
  fragment: { mode: "drop" },
});
defineRoute("o/$orgId/$itemId", { params: { orgId: numberParam, itemId: numberParam } }).redirect({
  // @ts-expect-error A route is not a redirect target.
  to: authoredLeaf,
  search: { mode: "drop" },
  fragment: { mode: "drop" },
});
// @ts-expect-error Params must be mapped when the names differ.
defineRoute("o/$x", { params: { x: numberParam } }).redirect({
  to: orgDestination,
  search: { mode: "drop" },
  fragment: { mode: "drop" },
});
defineRoute("o/$x", { params: { x: numberParam } }).redirect({
  to: orgDestination,
  params: { orgId: "x" },
  search: { mode: "drop" },
  fragment: { mode: "drop" },
});

// An extension factory's copy keeps its contributed steps' typing, through the parent copy.
declare const miniWitness: unique symbol;
type Arg<A> = A extends readonly [infer Value] ? Value : never;
type MarkRecord<A> = { mark: Arg<A> };
type GroupsRecord<A> = { groups: Arg<A> };
type MiniInputOf<Chain> = { rpc: GroupsOf<Chain> };
interface MarkStep extends StepSignature {
  readonly parameters: [mark: string];
  readonly own: MarkRecord<this["args"]>;
}
interface GroupsStep extends StepSignature {
  readonly parameters: [groups: Record<string, () => number>];
  readonly own: GroupsRecord<this["args"]>;
}
type GroupsOf<Chain> = Chain extends readonly [infer Head, ...infer Rest]
  ? (Head extends { groups: infer G } ? G : {}) & GroupsOf<Rest>
  : {};
interface MiniInput extends InputContribution {
  readonly input: MiniInputOf<this["chain"]>;
}
interface MiniSpec extends ExtensionSpec {
  readonly steps: readonly [
    { name: "mark"; type: MarkStep; serverOnly: true; arity: { min: 1; max: 1 } },
    { name: "groups"; type: GroupsStep; serverOnly: false; arity: { min: 1; max: 1 } },
  ];
  readonly input: MiniInput;
  readonly witness: typeof miniWitness;
}
declare const extended: RouteFactory<MiniSpec>;

const authoredXorg = extended("x/$orgId", { params: { orgId: numberParam } })
  .groups({ count: () => 2 })
  .resolve({ items: ({ rpc, params }) => rpc.count() + params.orgId });
const authoredXleaf = extended("i/$id", {
  parent: authoredXorg,
  params: { id: numberParam },
}).resolve({ total: ({ rpc, params }) => rpc.count() + params.id + params.orgId });
const xorgDestination = defineDestination("x/$orgId", { params: { orgId: numberParam } }, "xorg");
const xleafDestination = defineDestination(
  "i/$id",
  { parent: xorgDestination, params: { id: numberParam } },
  "xleaf",
);
// The extension overload resolves first, so the copy offers the contributed steps.
const xorgCopy = routeOf(extended, xorgDestination)
  .groups({ count: () => 2 })
  .resolve({ items: ({ rpc, params }) => rpc.count() + params.orgId });
const xleafCopy = routeOf(extended, xleafDestination, xorgCopy).resolve({
  total: ({ rpc, params }) => rpc.count() + params.id + params.orgId,
});

exact<Equal<DataOf<typeof xorgCopy>, DataOf<typeof authoredXorg>>>();
exact<Equal<DataOf<typeof xleafCopy>, DataOf<typeof authoredXleaf>>>();
exact<Equal<ContributionOf<typeof xleafCopy>, ContributionOf<typeof authoredXleaf>>>();
exact<Equal<ParamsOf<typeof xleafCopy>, ParamsOf<typeof authoredXleaf>>>();
routeOf(extended, xorgDestination)
  .mark("m")
  .groups({ count: () => 1 });
const grouped = routeOf(extended, xorgDestination).groups({ count: () => 1 });
// @ts-expect-error A used contributed step drops itself and every earlier one.
grouped.mark("m");
// @ts-expect-error The router's factory offers no contributed step.
routeOf(defineRoute, xorgDestination).groups({ count: () => 1 });
