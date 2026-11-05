// @loozo/angular-router routegen: owned destinations.generated.ts
import type { RouteSet, Handle as GeneratedHandle, Destination as GeneratedDestination } from '@loozo/angular-router/_generated';
import definition0 from "../src/routes/$package/+overview/route.js";
import definition1 from "../src/routes/$package/api/$symbol/route.js";
import definition2 from "../src/routes/$package/generated-api/route.js";
import definition3 from "../src/routes/$package/guide/$guide/route.js";
import definition4 from "../src/routes/$package/route.js";
import definition5 from "../src/routes/$segments[]/route.js";
import definition6 from "../src/routes/+home/route.js";

export type Definitions = {
"src/routes/$package/+overview/route.ts": typeof definition0;
"src/routes/$package/api/$symbol/route.ts": typeof definition1;
"src/routes/$package/generated-api/route.ts": typeof definition2;
"src/routes/$package/guide/$guide/route.ts": typeof definition3;
"src/routes/$package/route.ts": typeof definition4;
"src/routes/$segments[]/route.ts": typeof definition5;
"src/routes/+home/route.ts": typeof definition6;
};
declare const setIdentity: unique symbol;
export type AbsoluteTargets = {
"/$package": "src/routes/$package/+overview/route.ts";
"/$package/api/$symbol": "src/routes/$package/api/$symbol/route.ts";
"/$package/generated-api": "src/routes/$package/generated-api/route.ts";
"/$package/guide/$guide": "src/routes/$package/guide/$guide/route.ts";
"/$segments[]": "src/routes/$segments[]/route.ts";
"/": "src/routes/+home/route.ts";
};
export type Parents = {
"src/routes/$package/+overview/route.ts": "src/routes/+home/route.ts";
"src/routes/$package/api/$symbol/route.ts": "src/routes/$package/+overview/route.ts";
"src/routes/$package/generated-api/route.ts": "src/routes/$package/+overview/route.ts";
"src/routes/$package/guide/$guide/route.ts": "src/routes/$package/+overview/route.ts";
"src/routes/$package/route.ts": "src/routes/+home/route.ts";
"src/routes/$segments[]/route.ts": "src/routes/+home/route.ts";
};
/** Declarations with a colocated facade. */
export type Retained =
| "src/routes/$package/+overview/route.ts"
| "src/routes/$package/api/$symbol/route.ts"
| "src/routes/$package/generated-api/route.ts"
| "src/routes/$package/guide/$guide/route.ts"
| "src/routes/$package/route.ts"
| "src/routes/$segments[]/route.ts"
| "src/routes/+home/route.ts"
;
export type AbsoluteSelected = {
  readonly [Expression in keyof AbsoluteTargets]: Definitions[AbsoluteTargets[Expression] & keyof Definitions];
};
type ParentOf<Id extends Retained> = Id extends keyof Parents ? Definitions[Parents[Id] & keyof Definitions] : never;
/** A declaration-bound handle; obtain it through its colocated injectRoute facade. */
export type Handle<Id extends Retained> = GeneratedHandle<Definitions[Id], AbsoluteSelected, ParentOf<Id>, typeof setIdentity, Pick<Definitions, Retained>>;
/** A same-set nominal reference; use the destination exported by a colocated facade. */
export type Destination<Id extends Retained> = GeneratedDestination<Definitions[Id], typeof setIdentity, Id>;
const routeSet: RouteSet = { records: {
"src/routes/$package/+overview/route.ts": { definition: () => definition0, owners: ["src/routes/$package/route.ts","src/routes/$package/+overview/route.ts"] },
"src/routes/$package/api/$symbol/route.ts": { definition: () => definition1, owners: ["src/routes/$package/route.ts","src/routes/$package/api/$symbol/route.ts"] },
"src/routes/$package/generated-api/route.ts": { definition: () => definition2, owners: ["src/routes/$package/route.ts","src/routes/$package/generated-api/route.ts"] },
"src/routes/$package/guide/$guide/route.ts": { definition: () => definition3, owners: ["src/routes/$package/route.ts","src/routes/$package/guide/$guide/route.ts"] },
"src/routes/$package/route.ts": { definition: () => definition4, owners: ["src/routes/$package/route.ts"] },
"src/routes/$segments[]/route.ts": { definition: () => definition5, owners: ["src/routes/$segments[]/route.ts"] },
"src/routes/+home/route.ts": { definition: () => definition6, owners: ["src/routes/+home/route.ts"] },
}, destinations: {
"src/routes/$package/+overview/route.ts": () => definition0,
"src/routes/$package/api/$symbol/route.ts": () => definition1,
"src/routes/$package/generated-api/route.ts": () => definition2,
"src/routes/$package/guide/$guide/route.ts": () => definition3,
"src/routes/$package/route.ts": () => definition4,
"src/routes/$segments[]/route.ts": () => definition5,
"src/routes/+home/route.ts": () => definition6,
}, absolute: {"/$package":"src/routes/$package/+overview/route.ts","/$package/api/$symbol":"src/routes/$package/api/$symbol/route.ts","/$package/generated-api":"src/routes/$package/generated-api/route.ts","/$package/guide/$guide":"src/routes/$package/guide/$guide/route.ts","/$segments[]":"src/routes/$segments[]/route.ts","/":"src/routes/+home/route.ts"}, parents: {"src/routes/$package/+overview/route.ts":"src/routes/+home/route.ts","src/routes/$package/api/$symbol/route.ts":"src/routes/$package/+overview/route.ts","src/routes/$package/generated-api/route.ts":"src/routes/$package/+overview/route.ts","src/routes/$package/guide/$guide/route.ts":"src/routes/$package/+overview/route.ts","src/routes/$package/route.ts":"src/routes/+home/route.ts","src/routes/$segments[]/route.ts":"src/routes/+home/route.ts"} };
export function getRouteSet(): RouteSet { return routeSet; }
