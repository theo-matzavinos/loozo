// @loozo/angular-router routegen: owned destinations.generated.ts
import type { RouteSet, Handle as GeneratedHandle, Destination as GeneratedDestination } from '@loozo/angular-router/_generated';
import definition0 from "../src/routes/home/definition.js";
import definition1 from "../src/routes/not-found/definition.js";
import definition2 from "../src/routes/package/api/definition.js";
import definition3 from "../src/routes/package/definition.js";
import definition4 from "../src/routes/package/generated-api/definition.js";
import definition5 from "../src/routes/package/guide/definition.js";
import definition6 from "../src/routes/package/overview/definition.js";

export type Definitions = {
"src/routes/home/definition.ts": typeof definition0;
"src/routes/not-found/definition.ts": typeof definition1;
"src/routes/package/api/definition.ts": typeof definition2;
"src/routes/package/definition.ts": typeof definition3;
"src/routes/package/generated-api/definition.ts": typeof definition4;
"src/routes/package/guide/definition.ts": typeof definition5;
"src/routes/package/overview/definition.ts": typeof definition6;
};
declare const setIdentity: unique symbol;
export type AbsoluteTargets = {
"/": "src/routes/home/definition.ts";
"/$segments[]": "src/routes/not-found/definition.ts";
"/$package/api/$symbol": "src/routes/package/api/definition.ts";
"/$package": "src/routes/package/overview/definition.ts";
"/$package/generated-api": "src/routes/package/generated-api/definition.ts";
"/$package/guide/$guide": "src/routes/package/guide/definition.ts";
};
export type RelativeTargets = {
"src/routes/home/definition.ts": {
"./": "src/routes/home/definition.ts";
"./$segments[]": "src/routes/not-found/definition.ts";
"./$package/api/$symbol": "src/routes/package/api/definition.ts";
"./$package": "src/routes/package/overview/definition.ts";
"./$package/generated-api": "src/routes/package/generated-api/definition.ts";
"./$package/guide/$guide": "src/routes/package/guide/definition.ts";
};
"src/routes/not-found/definition.ts": {
};
"src/routes/package/api/definition.ts": {
"./": "src/routes/package/api/definition.ts";
"../$symbol": "src/routes/package/api/definition.ts";
"../../api/$symbol": "src/routes/package/api/definition.ts";
"../..": "src/routes/package/overview/definition.ts";
"../../": "src/routes/package/overview/definition.ts";
"../../generated-api": "src/routes/package/generated-api/definition.ts";
"../../guide/$guide": "src/routes/package/guide/definition.ts";
"../../..": "src/routes/home/definition.ts";
"../../../": "src/routes/home/definition.ts";
"../../../$segments[]": "src/routes/not-found/definition.ts";
"../../../$package/api/$symbol": "src/routes/package/api/definition.ts";
"../../../$package": "src/routes/package/overview/definition.ts";
"../../../$package/generated-api": "src/routes/package/generated-api/definition.ts";
"../../../$package/guide/$guide": "src/routes/package/guide/definition.ts";
};
"src/routes/package/definition.ts": {
"./api/$symbol": "src/routes/package/api/definition.ts";
"./": "src/routes/package/overview/definition.ts";
"./generated-api": "src/routes/package/generated-api/definition.ts";
"./guide/$guide": "src/routes/package/guide/definition.ts";
"..": "src/routes/home/definition.ts";
"../": "src/routes/home/definition.ts";
"../$segments[]": "src/routes/not-found/definition.ts";
"../$package/api/$symbol": "src/routes/package/api/definition.ts";
"../$package": "src/routes/package/overview/definition.ts";
"../$package/generated-api": "src/routes/package/generated-api/definition.ts";
"../$package/guide/$guide": "src/routes/package/guide/definition.ts";
};
"src/routes/package/generated-api/definition.ts": {
"./": "src/routes/package/generated-api/definition.ts";
"../api/$symbol": "src/routes/package/api/definition.ts";
"..": "src/routes/package/overview/definition.ts";
"../": "src/routes/package/overview/definition.ts";
"../generated-api": "src/routes/package/generated-api/definition.ts";
"../guide/$guide": "src/routes/package/guide/definition.ts";
"../..": "src/routes/home/definition.ts";
"../../": "src/routes/home/definition.ts";
"../../$segments[]": "src/routes/not-found/definition.ts";
"../../$package/api/$symbol": "src/routes/package/api/definition.ts";
"../../$package": "src/routes/package/overview/definition.ts";
"../../$package/generated-api": "src/routes/package/generated-api/definition.ts";
"../../$package/guide/$guide": "src/routes/package/guide/definition.ts";
};
"src/routes/package/guide/definition.ts": {
"./": "src/routes/package/guide/definition.ts";
"../$guide": "src/routes/package/guide/definition.ts";
"../../api/$symbol": "src/routes/package/api/definition.ts";
"../..": "src/routes/package/overview/definition.ts";
"../../": "src/routes/package/overview/definition.ts";
"../../generated-api": "src/routes/package/generated-api/definition.ts";
"../../guide/$guide": "src/routes/package/guide/definition.ts";
"../../..": "src/routes/home/definition.ts";
"../../../": "src/routes/home/definition.ts";
"../../../$segments[]": "src/routes/not-found/definition.ts";
"../../../$package/api/$symbol": "src/routes/package/api/definition.ts";
"../../../$package": "src/routes/package/overview/definition.ts";
"../../../$package/generated-api": "src/routes/package/generated-api/definition.ts";
"../../../$package/guide/$guide": "src/routes/package/guide/definition.ts";
};
"src/routes/package/overview/definition.ts": {
"./api/$symbol": "src/routes/package/api/definition.ts";
"./": "src/routes/package/overview/definition.ts";
"./generated-api": "src/routes/package/generated-api/definition.ts";
"./guide/$guide": "src/routes/package/guide/definition.ts";
"..": "src/routes/home/definition.ts";
"../": "src/routes/home/definition.ts";
"../$segments[]": "src/routes/not-found/definition.ts";
"../$package/api/$symbol": "src/routes/package/api/definition.ts";
"../$package": "src/routes/package/overview/definition.ts";
"../$package/generated-api": "src/routes/package/generated-api/definition.ts";
"../$package/guide/$guide": "src/routes/package/guide/definition.ts";
};
};
export type Selected<Id extends keyof RelativeTargets> = {
  readonly [Expression in keyof AbsoluteTargets | keyof RelativeTargets[Id]]:
    Definitions[(Expression extends keyof AbsoluteTargets ? AbsoluteTargets[Expression] :
      Expression extends keyof RelativeTargets[Id] ? RelativeTargets[Id][Expression] : never) & keyof Definitions];
};
/** A declaration-bound handle; obtain it through its colocated injectRoute facade. */
export type Handle<Id extends keyof RelativeTargets> = GeneratedHandle<Definitions[Id], Selected<Id>, typeof setIdentity, Pick<Definitions, keyof RelativeTargets>>;
/** A same-set nominal reference; use the destination exported by a colocated facade. */
export type Destination<Id extends keyof RelativeTargets> = GeneratedDestination<Definitions[Id], typeof setIdentity, Id>;
const routeSet: RouteSet = { records: {
"src/routes/home/definition.ts": { definition: () => definition0, owners: ["src/routes/home/definition.ts"] },
"src/routes/not-found/definition.ts": { definition: () => definition1, owners: ["src/routes/not-found/definition.ts"] },
"src/routes/package/api/definition.ts": { definition: () => definition2, owners: ["src/routes/package/definition.ts","src/routes/package/api/definition.ts"] },
"src/routes/package/definition.ts": { definition: () => definition3, owners: ["src/routes/package/definition.ts"] },
"src/routes/package/generated-api/definition.ts": { definition: () => definition4, owners: ["src/routes/package/definition.ts","src/routes/package/generated-api/definition.ts"] },
"src/routes/package/guide/definition.ts": { definition: () => definition5, owners: ["src/routes/package/definition.ts","src/routes/package/guide/definition.ts"] },
"src/routes/package/overview/definition.ts": { definition: () => definition6, owners: ["src/routes/package/definition.ts","src/routes/package/overview/definition.ts"] },
}, destinations: {
"src/routes/home/definition.ts": () => definition0,
"src/routes/not-found/definition.ts": () => definition1,
"src/routes/package/api/definition.ts": () => definition2,
"src/routes/package/definition.ts": () => definition3,
"src/routes/package/generated-api/definition.ts": () => definition4,
"src/routes/package/guide/definition.ts": () => definition5,
"src/routes/package/overview/definition.ts": () => definition6,
}, absolute: {"/":"src/routes/home/definition.ts","/$segments[]":"src/routes/not-found/definition.ts","/$package/api/$symbol":"src/routes/package/api/definition.ts","/$package":"src/routes/package/overview/definition.ts","/$package/generated-api":"src/routes/package/generated-api/definition.ts","/$package/guide/$guide":"src/routes/package/guide/definition.ts"}, relative: {"src/routes/home/definition.ts":{"./":"src/routes/home/definition.ts","./$segments[]":"src/routes/not-found/definition.ts","./$package/api/$symbol":"src/routes/package/api/definition.ts","./$package":"src/routes/package/overview/definition.ts","./$package/generated-api":"src/routes/package/generated-api/definition.ts","./$package/guide/$guide":"src/routes/package/guide/definition.ts"},"src/routes/not-found/definition.ts":{},"src/routes/package/api/definition.ts":{"./":"src/routes/package/api/definition.ts","../$symbol":"src/routes/package/api/definition.ts","../../api/$symbol":"src/routes/package/api/definition.ts","../..":"src/routes/package/overview/definition.ts","../../":"src/routes/package/overview/definition.ts","../../generated-api":"src/routes/package/generated-api/definition.ts","../../guide/$guide":"src/routes/package/guide/definition.ts","../../..":"src/routes/home/definition.ts","../../../":"src/routes/home/definition.ts","../../../$segments[]":"src/routes/not-found/definition.ts","../../../$package/api/$symbol":"src/routes/package/api/definition.ts","../../../$package":"src/routes/package/overview/definition.ts","../../../$package/generated-api":"src/routes/package/generated-api/definition.ts","../../../$package/guide/$guide":"src/routes/package/guide/definition.ts"},"src/routes/package/definition.ts":{"./api/$symbol":"src/routes/package/api/definition.ts","./":"src/routes/package/overview/definition.ts","./generated-api":"src/routes/package/generated-api/definition.ts","./guide/$guide":"src/routes/package/guide/definition.ts","..":"src/routes/home/definition.ts","../":"src/routes/home/definition.ts","../$segments[]":"src/routes/not-found/definition.ts","../$package/api/$symbol":"src/routes/package/api/definition.ts","../$package":"src/routes/package/overview/definition.ts","../$package/generated-api":"src/routes/package/generated-api/definition.ts","../$package/guide/$guide":"src/routes/package/guide/definition.ts"},"src/routes/package/generated-api/definition.ts":{"./":"src/routes/package/generated-api/definition.ts","../api/$symbol":"src/routes/package/api/definition.ts","..":"src/routes/package/overview/definition.ts","../":"src/routes/package/overview/definition.ts","../generated-api":"src/routes/package/generated-api/definition.ts","../guide/$guide":"src/routes/package/guide/definition.ts","../..":"src/routes/home/definition.ts","../../":"src/routes/home/definition.ts","../../$segments[]":"src/routes/not-found/definition.ts","../../$package/api/$symbol":"src/routes/package/api/definition.ts","../../$package":"src/routes/package/overview/definition.ts","../../$package/generated-api":"src/routes/package/generated-api/definition.ts","../../$package/guide/$guide":"src/routes/package/guide/definition.ts"},"src/routes/package/guide/definition.ts":{"./":"src/routes/package/guide/definition.ts","../$guide":"src/routes/package/guide/definition.ts","../../api/$symbol":"src/routes/package/api/definition.ts","../..":"src/routes/package/overview/definition.ts","../../":"src/routes/package/overview/definition.ts","../../generated-api":"src/routes/package/generated-api/definition.ts","../../guide/$guide":"src/routes/package/guide/definition.ts","../../..":"src/routes/home/definition.ts","../../../":"src/routes/home/definition.ts","../../../$segments[]":"src/routes/not-found/definition.ts","../../../$package/api/$symbol":"src/routes/package/api/definition.ts","../../../$package":"src/routes/package/overview/definition.ts","../../../$package/generated-api":"src/routes/package/generated-api/definition.ts","../../../$package/guide/$guide":"src/routes/package/guide/definition.ts"},"src/routes/package/overview/definition.ts":{"./api/$symbol":"src/routes/package/api/definition.ts","./":"src/routes/package/overview/definition.ts","./generated-api":"src/routes/package/generated-api/definition.ts","./guide/$guide":"src/routes/package/guide/definition.ts","..":"src/routes/home/definition.ts","../":"src/routes/home/definition.ts","../$segments[]":"src/routes/not-found/definition.ts","../$package/api/$symbol":"src/routes/package/api/definition.ts","../$package":"src/routes/package/overview/definition.ts","../$package/generated-api":"src/routes/package/generated-api/definition.ts","../$package/guide/$guide":"src/routes/package/guide/definition.ts"}} };
export function getRouteSet(): RouteSet { return routeSet; }
