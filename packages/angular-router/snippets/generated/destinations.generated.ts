// @loozo/angular-router routegen: owned destinations.generated.ts
import type { RouteSet, Handle as GeneratedHandle, Destination as GeneratedDestination } from '@loozo/angular-router/_generated';
import definition0 from "../src/routes/products/$productId/route.js";
import definition1 from "../src/routes/reports/$reportId/route.js";
import definition2 from "../src/routes/teams/$teamId/items/$id/route.js";
import definition3 from "../src/routes/teams/$teamId/members/$memberId/route.js";
import definition4 from "../src/routes/teams/$teamId/old-items/$id/route.js";
import definition5 from "../src/routes/teams/$teamId/route.js";

export type Definitions = {
"src/routes/products/$productId/route.ts": typeof definition0;
"src/routes/reports/$reportId/route.ts": typeof definition1;
"src/routes/teams/$teamId/items/$id/route.ts": typeof definition2;
"src/routes/teams/$teamId/members/$memberId/route.ts": typeof definition3;
"src/routes/teams/$teamId/old-items/$id/route.ts": typeof definition4;
"src/routes/teams/$teamId/route.ts": typeof definition5;
};
declare const setIdentity: unique symbol;
export type AbsoluteTargets = {
"/products/$productId": "src/routes/products/$productId/route.ts";
"/reports/$reportId": "src/routes/reports/$reportId/route.ts";
"/teams/$teamId/items/$id": "src/routes/teams/$teamId/items/$id/route.ts";
"/teams/$teamId/members/$memberId": "src/routes/teams/$teamId/members/$memberId/route.ts";
"/teams/$teamId/old-items/$id": "src/routes/teams/$teamId/old-items/$id/route.ts";
"/teams/$teamId": "src/routes/teams/$teamId/route.ts";
};
export type RelativeTargets = {
"src/routes/products/$productId/route.ts": {
"./": "src/routes/products/$productId/route.ts";
"../$productId": "src/routes/products/$productId/route.ts";
"../../products/$productId": "src/routes/products/$productId/route.ts";
"../../reports/$reportId": "src/routes/reports/$reportId/route.ts";
"../../teams/$teamId/items/$id": "src/routes/teams/$teamId/items/$id/route.ts";
"../../teams/$teamId/members/$memberId": "src/routes/teams/$teamId/members/$memberId/route.ts";
"../../teams/$teamId/old-items/$id": "src/routes/teams/$teamId/old-items/$id/route.ts";
"../../teams/$teamId": "src/routes/teams/$teamId/route.ts";
};
"src/routes/reports/$reportId/route.ts": {
"./": "src/routes/reports/$reportId/route.ts";
"../$reportId": "src/routes/reports/$reportId/route.ts";
"../../products/$productId": "src/routes/products/$productId/route.ts";
"../../reports/$reportId": "src/routes/reports/$reportId/route.ts";
"../../teams/$teamId/items/$id": "src/routes/teams/$teamId/items/$id/route.ts";
"../../teams/$teamId/members/$memberId": "src/routes/teams/$teamId/members/$memberId/route.ts";
"../../teams/$teamId/old-items/$id": "src/routes/teams/$teamId/old-items/$id/route.ts";
"../../teams/$teamId": "src/routes/teams/$teamId/route.ts";
};
"src/routes/teams/$teamId/items/$id/route.ts": {
"./": "src/routes/teams/$teamId/items/$id/route.ts";
"../$id": "src/routes/teams/$teamId/items/$id/route.ts";
"../../items/$id": "src/routes/teams/$teamId/items/$id/route.ts";
"../../members/$memberId": "src/routes/teams/$teamId/members/$memberId/route.ts";
"../../old-items/$id": "src/routes/teams/$teamId/old-items/$id/route.ts";
"../..": "src/routes/teams/$teamId/route.ts";
"../../": "src/routes/teams/$teamId/route.ts";
"../../../$teamId/items/$id": "src/routes/teams/$teamId/items/$id/route.ts";
"../../../$teamId/members/$memberId": "src/routes/teams/$teamId/members/$memberId/route.ts";
"../../../$teamId/old-items/$id": "src/routes/teams/$teamId/old-items/$id/route.ts";
"../../../$teamId": "src/routes/teams/$teamId/route.ts";
"../../../../products/$productId": "src/routes/products/$productId/route.ts";
"../../../../reports/$reportId": "src/routes/reports/$reportId/route.ts";
"../../../../teams/$teamId/items/$id": "src/routes/teams/$teamId/items/$id/route.ts";
"../../../../teams/$teamId/members/$memberId": "src/routes/teams/$teamId/members/$memberId/route.ts";
"../../../../teams/$teamId/old-items/$id": "src/routes/teams/$teamId/old-items/$id/route.ts";
"../../../../teams/$teamId": "src/routes/teams/$teamId/route.ts";
};
"src/routes/teams/$teamId/members/$memberId/route.ts": {
"./": "src/routes/teams/$teamId/members/$memberId/route.ts";
"../$memberId": "src/routes/teams/$teamId/members/$memberId/route.ts";
"../../items/$id": "src/routes/teams/$teamId/items/$id/route.ts";
"../../members/$memberId": "src/routes/teams/$teamId/members/$memberId/route.ts";
"../../old-items/$id": "src/routes/teams/$teamId/old-items/$id/route.ts";
"../..": "src/routes/teams/$teamId/route.ts";
"../../": "src/routes/teams/$teamId/route.ts";
"../../../$teamId/items/$id": "src/routes/teams/$teamId/items/$id/route.ts";
"../../../$teamId/members/$memberId": "src/routes/teams/$teamId/members/$memberId/route.ts";
"../../../$teamId/old-items/$id": "src/routes/teams/$teamId/old-items/$id/route.ts";
"../../../$teamId": "src/routes/teams/$teamId/route.ts";
"../../../../products/$productId": "src/routes/products/$productId/route.ts";
"../../../../reports/$reportId": "src/routes/reports/$reportId/route.ts";
"../../../../teams/$teamId/items/$id": "src/routes/teams/$teamId/items/$id/route.ts";
"../../../../teams/$teamId/members/$memberId": "src/routes/teams/$teamId/members/$memberId/route.ts";
"../../../../teams/$teamId/old-items/$id": "src/routes/teams/$teamId/old-items/$id/route.ts";
"../../../../teams/$teamId": "src/routes/teams/$teamId/route.ts";
};
"src/routes/teams/$teamId/route.ts": {
"./items/$id": "src/routes/teams/$teamId/items/$id/route.ts";
"./members/$memberId": "src/routes/teams/$teamId/members/$memberId/route.ts";
"./old-items/$id": "src/routes/teams/$teamId/old-items/$id/route.ts";
"./": "src/routes/teams/$teamId/route.ts";
"../$teamId/items/$id": "src/routes/teams/$teamId/items/$id/route.ts";
"../$teamId/members/$memberId": "src/routes/teams/$teamId/members/$memberId/route.ts";
"../$teamId/old-items/$id": "src/routes/teams/$teamId/old-items/$id/route.ts";
"../$teamId": "src/routes/teams/$teamId/route.ts";
"../../products/$productId": "src/routes/products/$productId/route.ts";
"../../reports/$reportId": "src/routes/reports/$reportId/route.ts";
"../../teams/$teamId/items/$id": "src/routes/teams/$teamId/items/$id/route.ts";
"../../teams/$teamId/members/$memberId": "src/routes/teams/$teamId/members/$memberId/route.ts";
"../../teams/$teamId/old-items/$id": "src/routes/teams/$teamId/old-items/$id/route.ts";
"../../teams/$teamId": "src/routes/teams/$teamId/route.ts";
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
"src/routes/products/$productId/route.ts": { definition: () => definition0, owners: ["src/routes/products/$productId/route.ts"] },
"src/routes/reports/$reportId/route.ts": { definition: () => definition1, owners: ["src/routes/reports/$reportId/route.ts"] },
"src/routes/teams/$teamId/items/$id/route.ts": { definition: () => definition2, owners: ["src/routes/teams/$teamId/route.ts","src/routes/teams/$teamId/items/$id/route.ts"] },
"src/routes/teams/$teamId/members/$memberId/route.ts": { definition: () => definition3, owners: ["src/routes/teams/$teamId/route.ts","src/routes/teams/$teamId/members/$memberId/route.ts"] },
"src/routes/teams/$teamId/route.ts": { definition: () => definition5, owners: ["src/routes/teams/$teamId/route.ts"] },
}, destinations: {
"src/routes/products/$productId/route.ts": () => definition0,
"src/routes/reports/$reportId/route.ts": () => definition1,
"src/routes/teams/$teamId/items/$id/route.ts": () => definition2,
"src/routes/teams/$teamId/members/$memberId/route.ts": () => definition3,
"src/routes/teams/$teamId/old-items/$id/route.ts": () => definition4,
"src/routes/teams/$teamId/route.ts": () => definition5,
}, absolute: {"/products/$productId":"src/routes/products/$productId/route.ts","/reports/$reportId":"src/routes/reports/$reportId/route.ts","/teams/$teamId/items/$id":"src/routes/teams/$teamId/items/$id/route.ts","/teams/$teamId/members/$memberId":"src/routes/teams/$teamId/members/$memberId/route.ts","/teams/$teamId/old-items/$id":"src/routes/teams/$teamId/old-items/$id/route.ts","/teams/$teamId":"src/routes/teams/$teamId/route.ts"}, relative: {"src/routes/products/$productId/route.ts":{"./":"src/routes/products/$productId/route.ts","../$productId":"src/routes/products/$productId/route.ts","../../products/$productId":"src/routes/products/$productId/route.ts","../../reports/$reportId":"src/routes/reports/$reportId/route.ts","../../teams/$teamId/items/$id":"src/routes/teams/$teamId/items/$id/route.ts","../../teams/$teamId/members/$memberId":"src/routes/teams/$teamId/members/$memberId/route.ts","../../teams/$teamId/old-items/$id":"src/routes/teams/$teamId/old-items/$id/route.ts","../../teams/$teamId":"src/routes/teams/$teamId/route.ts"},"src/routes/reports/$reportId/route.ts":{"./":"src/routes/reports/$reportId/route.ts","../$reportId":"src/routes/reports/$reportId/route.ts","../../products/$productId":"src/routes/products/$productId/route.ts","../../reports/$reportId":"src/routes/reports/$reportId/route.ts","../../teams/$teamId/items/$id":"src/routes/teams/$teamId/items/$id/route.ts","../../teams/$teamId/members/$memberId":"src/routes/teams/$teamId/members/$memberId/route.ts","../../teams/$teamId/old-items/$id":"src/routes/teams/$teamId/old-items/$id/route.ts","../../teams/$teamId":"src/routes/teams/$teamId/route.ts"},"src/routes/teams/$teamId/items/$id/route.ts":{"./":"src/routes/teams/$teamId/items/$id/route.ts","../$id":"src/routes/teams/$teamId/items/$id/route.ts","../../items/$id":"src/routes/teams/$teamId/items/$id/route.ts","../../members/$memberId":"src/routes/teams/$teamId/members/$memberId/route.ts","../../old-items/$id":"src/routes/teams/$teamId/old-items/$id/route.ts","../..":"src/routes/teams/$teamId/route.ts","../../":"src/routes/teams/$teamId/route.ts","../../../$teamId/items/$id":"src/routes/teams/$teamId/items/$id/route.ts","../../../$teamId/members/$memberId":"src/routes/teams/$teamId/members/$memberId/route.ts","../../../$teamId/old-items/$id":"src/routes/teams/$teamId/old-items/$id/route.ts","../../../$teamId":"src/routes/teams/$teamId/route.ts","../../../../products/$productId":"src/routes/products/$productId/route.ts","../../../../reports/$reportId":"src/routes/reports/$reportId/route.ts","../../../../teams/$teamId/items/$id":"src/routes/teams/$teamId/items/$id/route.ts","../../../../teams/$teamId/members/$memberId":"src/routes/teams/$teamId/members/$memberId/route.ts","../../../../teams/$teamId/old-items/$id":"src/routes/teams/$teamId/old-items/$id/route.ts","../../../../teams/$teamId":"src/routes/teams/$teamId/route.ts"},"src/routes/teams/$teamId/members/$memberId/route.ts":{"./":"src/routes/teams/$teamId/members/$memberId/route.ts","../$memberId":"src/routes/teams/$teamId/members/$memberId/route.ts","../../items/$id":"src/routes/teams/$teamId/items/$id/route.ts","../../members/$memberId":"src/routes/teams/$teamId/members/$memberId/route.ts","../../old-items/$id":"src/routes/teams/$teamId/old-items/$id/route.ts","../..":"src/routes/teams/$teamId/route.ts","../../":"src/routes/teams/$teamId/route.ts","../../../$teamId/items/$id":"src/routes/teams/$teamId/items/$id/route.ts","../../../$teamId/members/$memberId":"src/routes/teams/$teamId/members/$memberId/route.ts","../../../$teamId/old-items/$id":"src/routes/teams/$teamId/old-items/$id/route.ts","../../../$teamId":"src/routes/teams/$teamId/route.ts","../../../../products/$productId":"src/routes/products/$productId/route.ts","../../../../reports/$reportId":"src/routes/reports/$reportId/route.ts","../../../../teams/$teamId/items/$id":"src/routes/teams/$teamId/items/$id/route.ts","../../../../teams/$teamId/members/$memberId":"src/routes/teams/$teamId/members/$memberId/route.ts","../../../../teams/$teamId/old-items/$id":"src/routes/teams/$teamId/old-items/$id/route.ts","../../../../teams/$teamId":"src/routes/teams/$teamId/route.ts"},"src/routes/teams/$teamId/route.ts":{"./items/$id":"src/routes/teams/$teamId/items/$id/route.ts","./members/$memberId":"src/routes/teams/$teamId/members/$memberId/route.ts","./old-items/$id":"src/routes/teams/$teamId/old-items/$id/route.ts","./":"src/routes/teams/$teamId/route.ts","../$teamId/items/$id":"src/routes/teams/$teamId/items/$id/route.ts","../$teamId/members/$memberId":"src/routes/teams/$teamId/members/$memberId/route.ts","../$teamId/old-items/$id":"src/routes/teams/$teamId/old-items/$id/route.ts","../$teamId":"src/routes/teams/$teamId/route.ts","../../products/$productId":"src/routes/products/$productId/route.ts","../../reports/$reportId":"src/routes/reports/$reportId/route.ts","../../teams/$teamId/items/$id":"src/routes/teams/$teamId/items/$id/route.ts","../../teams/$teamId/members/$memberId":"src/routes/teams/$teamId/members/$memberId/route.ts","../../teams/$teamId/old-items/$id":"src/routes/teams/$teamId/old-items/$id/route.ts","../../teams/$teamId":"src/routes/teams/$teamId/route.ts"}} };
export function getRouteSet(): RouteSet { return routeSet; }
