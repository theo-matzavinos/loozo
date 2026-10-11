// @loozo/angular-router routegen: owned destinations.generated.ts
import type { RouteSet, Handle as GeneratedHandle, Destination as GeneratedDestination } from '@loozo/angular-router/_generated';
import definition0 from "../src/routes/alias/definition.js";
import definition1 from "../src/routes/handle-only/definition.js";
import definition2 from "../src/routes/home/definition.js";
import definition3 from "../src/routes/item/definition.js";
import definition4 from "../src/routes/team/definition.js";

export type Definitions = {
"src/routes/alias/definition.ts": typeof definition0;
"src/routes/handle-only/definition.ts": typeof definition1;
"src/routes/home/definition.ts": typeof definition2;
"src/routes/item/definition.ts": typeof definition3;
"src/routes/team/definition.ts": typeof definition4;
};
declare const setIdentity: unique symbol;
export type AbsoluteTargets = {
"/teams/$teamId/old-items/$id": "src/routes/alias/definition.ts";
"/handle-only/$id": "src/routes/handle-only/definition.ts";
"/": "src/routes/home/definition.ts";
"/teams/$teamId/items/$id": "src/routes/item/definition.ts";
"/teams/$teamId": "src/routes/team/definition.ts";
};
export type RelativeTargets = {
"src/routes/handle-only/definition.ts": {
"./": "src/routes/handle-only/definition.ts";
"../$id": "src/routes/handle-only/definition.ts";
"../../teams/$teamId/old-items/$id": "src/routes/alias/definition.ts";
"../../handle-only/$id": "src/routes/handle-only/definition.ts";
"../..": "src/routes/home/definition.ts";
"../../": "src/routes/home/definition.ts";
"../../teams/$teamId/items/$id": "src/routes/item/definition.ts";
"../../teams/$teamId": "src/routes/team/definition.ts";
};
"src/routes/home/definition.ts": {
"./teams/$teamId/old-items/$id": "src/routes/alias/definition.ts";
"./handle-only/$id": "src/routes/handle-only/definition.ts";
"./": "src/routes/home/definition.ts";
"./teams/$teamId/items/$id": "src/routes/item/definition.ts";
"./teams/$teamId": "src/routes/team/definition.ts";
};
"src/routes/item/definition.ts": {
"./": "src/routes/item/definition.ts";
"../$id": "src/routes/item/definition.ts";
"../../old-items/$id": "src/routes/alias/definition.ts";
"../../items/$id": "src/routes/item/definition.ts";
"../..": "src/routes/team/definition.ts";
"../../": "src/routes/team/definition.ts";
"../../../$teamId/old-items/$id": "src/routes/alias/definition.ts";
"../../../$teamId/items/$id": "src/routes/item/definition.ts";
"../../../$teamId": "src/routes/team/definition.ts";
"../../../../teams/$teamId/old-items/$id": "src/routes/alias/definition.ts";
"../../../../handle-only/$id": "src/routes/handle-only/definition.ts";
"../../../..": "src/routes/home/definition.ts";
"../../../../": "src/routes/home/definition.ts";
"../../../../teams/$teamId/items/$id": "src/routes/item/definition.ts";
"../../../../teams/$teamId": "src/routes/team/definition.ts";
};
"src/routes/team/definition.ts": {
"./old-items/$id": "src/routes/alias/definition.ts";
"./items/$id": "src/routes/item/definition.ts";
"./": "src/routes/team/definition.ts";
"../$teamId/old-items/$id": "src/routes/alias/definition.ts";
"../$teamId/items/$id": "src/routes/item/definition.ts";
"../$teamId": "src/routes/team/definition.ts";
"../../teams/$teamId/old-items/$id": "src/routes/alias/definition.ts";
"../../handle-only/$id": "src/routes/handle-only/definition.ts";
"../..": "src/routes/home/definition.ts";
"../../": "src/routes/home/definition.ts";
"../../teams/$teamId/items/$id": "src/routes/item/definition.ts";
"../../teams/$teamId": "src/routes/team/definition.ts";
};
};
export type Selected<Id extends keyof RelativeTargets> = {
  readonly [Expression in keyof AbsoluteTargets | keyof RelativeTargets[Id]]:
    Definitions[(Expression extends keyof AbsoluteTargets ? AbsoluteTargets[Expression] :
      Expression extends keyof RelativeTargets[Id] ? RelativeTargets[Id][Expression] : never) & keyof Definitions];
};
export type Handle<Id extends keyof RelativeTargets> = GeneratedHandle<Definitions[Id], Selected<Id>, typeof setIdentity, Pick<Definitions, keyof RelativeTargets>>;
export type Destination<Id extends keyof RelativeTargets> = GeneratedDestination<Definitions[Id], typeof setIdentity, Id>;
const routeSet: RouteSet = { records: {
"src/routes/handle-only/definition.ts": { definition: () => definition1, owners: ["src/routes/handle-only/definition.ts"] },
"src/routes/home/definition.ts": { definition: () => definition2, owners: ["src/routes/home/definition.ts"] },
"src/routes/item/definition.ts": { definition: () => definition3, owners: ["src/routes/team/definition.ts","src/routes/item/definition.ts"] },
"src/routes/team/definition.ts": { definition: () => definition4, owners: ["src/routes/team/definition.ts"] },
}, destinations: {
"src/routes/alias/definition.ts": () => definition0,
"src/routes/handle-only/definition.ts": () => definition1,
"src/routes/home/definition.ts": () => definition2,
"src/routes/item/definition.ts": () => definition3,
"src/routes/team/definition.ts": () => definition4,
}, absolute: {"/teams/$teamId/old-items/$id":"src/routes/alias/definition.ts","/handle-only/$id":"src/routes/handle-only/definition.ts","/":"src/routes/home/definition.ts","/teams/$teamId/items/$id":"src/routes/item/definition.ts","/teams/$teamId":"src/routes/team/definition.ts"}, relative: {"src/routes/handle-only/definition.ts":{"./":"src/routes/handle-only/definition.ts","../$id":"src/routes/handle-only/definition.ts","../../teams/$teamId/old-items/$id":"src/routes/alias/definition.ts","../../handle-only/$id":"src/routes/handle-only/definition.ts","../..":"src/routes/home/definition.ts","../../":"src/routes/home/definition.ts","../../teams/$teamId/items/$id":"src/routes/item/definition.ts","../../teams/$teamId":"src/routes/team/definition.ts"},"src/routes/home/definition.ts":{"./teams/$teamId/old-items/$id":"src/routes/alias/definition.ts","./handle-only/$id":"src/routes/handle-only/definition.ts","./":"src/routes/home/definition.ts","./teams/$teamId/items/$id":"src/routes/item/definition.ts","./teams/$teamId":"src/routes/team/definition.ts"},"src/routes/item/definition.ts":{"./":"src/routes/item/definition.ts","../$id":"src/routes/item/definition.ts","../../old-items/$id":"src/routes/alias/definition.ts","../../items/$id":"src/routes/item/definition.ts","../..":"src/routes/team/definition.ts","../../":"src/routes/team/definition.ts","../../../$teamId/old-items/$id":"src/routes/alias/definition.ts","../../../$teamId/items/$id":"src/routes/item/definition.ts","../../../$teamId":"src/routes/team/definition.ts","../../../../teams/$teamId/old-items/$id":"src/routes/alias/definition.ts","../../../../handle-only/$id":"src/routes/handle-only/definition.ts","../../../..":"src/routes/home/definition.ts","../../../../":"src/routes/home/definition.ts","../../../../teams/$teamId/items/$id":"src/routes/item/definition.ts","../../../../teams/$teamId":"src/routes/team/definition.ts"},"src/routes/team/definition.ts":{"./old-items/$id":"src/routes/alias/definition.ts","./items/$id":"src/routes/item/definition.ts","./":"src/routes/team/definition.ts","../$teamId/old-items/$id":"src/routes/alias/definition.ts","../$teamId/items/$id":"src/routes/item/definition.ts","../$teamId":"src/routes/team/definition.ts","../../teams/$teamId/old-items/$id":"src/routes/alias/definition.ts","../../handle-only/$id":"src/routes/handle-only/definition.ts","../..":"src/routes/home/definition.ts","../../":"src/routes/home/definition.ts","../../teams/$teamId/items/$id":"src/routes/item/definition.ts","../../teams/$teamId":"src/routes/team/definition.ts"}} };
export function getRouteSet(): RouteSet { return routeSet; }
