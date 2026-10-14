// @loozo/angular-router routegen: owned destinations.generated.ts
import type { RouteSet, Handle as GeneratedHandle, Destination as GeneratedDestination } from '@loozo/angular-router/_generated';
import definition0 from "../src/routes/item/definition.js";
import definition1 from "../src/routes/member/definition.js";
import definition2 from "../src/routes/old-item/definition.js";
import definition3 from "../src/routes/product/definition.js";
import definition4 from "../src/routes/report/definition.js";
import definition5 from "../src/routes/team/definition.js";

export type Definitions = {
"src/routes/item/definition.ts": typeof definition0;
"src/routes/member/definition.ts": typeof definition1;
"src/routes/old-item/definition.ts": typeof definition2;
"src/routes/product/definition.ts": typeof definition3;
"src/routes/report/definition.ts": typeof definition4;
"src/routes/team/definition.ts": typeof definition5;
};
declare const setIdentity: unique symbol;
export type AbsoluteTargets = {
"/teams/$teamId/items/$id": "src/routes/item/definition.ts";
"/teams/$teamId/members/$memberId": "src/routes/member/definition.ts";
"/teams/$teamId/old-items/$id": "src/routes/old-item/definition.ts";
"/products/$productId": "src/routes/product/definition.ts";
"/reports/$reportId": "src/routes/report/definition.ts";
"/teams/$teamId": "src/routes/team/definition.ts";
};
export type RelativeTargets = {
"src/routes/item/definition.ts": {
"./": "src/routes/item/definition.ts";
"../$id": "src/routes/item/definition.ts";
"../../items/$id": "src/routes/item/definition.ts";
"../../members/$memberId": "src/routes/member/definition.ts";
"../../old-items/$id": "src/routes/old-item/definition.ts";
"../..": "src/routes/team/definition.ts";
"../../": "src/routes/team/definition.ts";
"../../../$teamId/items/$id": "src/routes/item/definition.ts";
"../../../$teamId/members/$memberId": "src/routes/member/definition.ts";
"../../../$teamId/old-items/$id": "src/routes/old-item/definition.ts";
"../../../$teamId": "src/routes/team/definition.ts";
"../../../../teams/$teamId/items/$id": "src/routes/item/definition.ts";
"../../../../teams/$teamId/members/$memberId": "src/routes/member/definition.ts";
"../../../../teams/$teamId/old-items/$id": "src/routes/old-item/definition.ts";
"../../../../products/$productId": "src/routes/product/definition.ts";
"../../../../reports/$reportId": "src/routes/report/definition.ts";
"../../../../teams/$teamId": "src/routes/team/definition.ts";
};
"src/routes/member/definition.ts": {
"./": "src/routes/member/definition.ts";
"../$memberId": "src/routes/member/definition.ts";
"../../items/$id": "src/routes/item/definition.ts";
"../../members/$memberId": "src/routes/member/definition.ts";
"../../old-items/$id": "src/routes/old-item/definition.ts";
"../..": "src/routes/team/definition.ts";
"../../": "src/routes/team/definition.ts";
"../../../$teamId/items/$id": "src/routes/item/definition.ts";
"../../../$teamId/members/$memberId": "src/routes/member/definition.ts";
"../../../$teamId/old-items/$id": "src/routes/old-item/definition.ts";
"../../../$teamId": "src/routes/team/definition.ts";
"../../../../teams/$teamId/items/$id": "src/routes/item/definition.ts";
"../../../../teams/$teamId/members/$memberId": "src/routes/member/definition.ts";
"../../../../teams/$teamId/old-items/$id": "src/routes/old-item/definition.ts";
"../../../../products/$productId": "src/routes/product/definition.ts";
"../../../../reports/$reportId": "src/routes/report/definition.ts";
"../../../../teams/$teamId": "src/routes/team/definition.ts";
};
"src/routes/product/definition.ts": {
"./": "src/routes/product/definition.ts";
"../$productId": "src/routes/product/definition.ts";
"../../teams/$teamId/items/$id": "src/routes/item/definition.ts";
"../../teams/$teamId/members/$memberId": "src/routes/member/definition.ts";
"../../teams/$teamId/old-items/$id": "src/routes/old-item/definition.ts";
"../../products/$productId": "src/routes/product/definition.ts";
"../../reports/$reportId": "src/routes/report/definition.ts";
"../../teams/$teamId": "src/routes/team/definition.ts";
};
"src/routes/report/definition.ts": {
"./": "src/routes/report/definition.ts";
"../$reportId": "src/routes/report/definition.ts";
"../../teams/$teamId/items/$id": "src/routes/item/definition.ts";
"../../teams/$teamId/members/$memberId": "src/routes/member/definition.ts";
"../../teams/$teamId/old-items/$id": "src/routes/old-item/definition.ts";
"../../products/$productId": "src/routes/product/definition.ts";
"../../reports/$reportId": "src/routes/report/definition.ts";
"../../teams/$teamId": "src/routes/team/definition.ts";
};
"src/routes/team/definition.ts": {
"./items/$id": "src/routes/item/definition.ts";
"./members/$memberId": "src/routes/member/definition.ts";
"./old-items/$id": "src/routes/old-item/definition.ts";
"./": "src/routes/team/definition.ts";
"../$teamId/items/$id": "src/routes/item/definition.ts";
"../$teamId/members/$memberId": "src/routes/member/definition.ts";
"../$teamId/old-items/$id": "src/routes/old-item/definition.ts";
"../$teamId": "src/routes/team/definition.ts";
"../../teams/$teamId/items/$id": "src/routes/item/definition.ts";
"../../teams/$teamId/members/$memberId": "src/routes/member/definition.ts";
"../../teams/$teamId/old-items/$id": "src/routes/old-item/definition.ts";
"../../products/$productId": "src/routes/product/definition.ts";
"../../reports/$reportId": "src/routes/report/definition.ts";
"../../teams/$teamId": "src/routes/team/definition.ts";
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
"src/routes/item/definition.ts": { definition: () => definition0, owners: ["src/routes/team/definition.ts","src/routes/item/definition.ts"] },
"src/routes/member/definition.ts": { definition: () => definition1, owners: ["src/routes/team/definition.ts","src/routes/member/definition.ts"] },
"src/routes/product/definition.ts": { definition: () => definition3, owners: ["src/routes/product/definition.ts"] },
"src/routes/report/definition.ts": { definition: () => definition4, owners: ["src/routes/report/definition.ts"] },
"src/routes/team/definition.ts": { definition: () => definition5, owners: ["src/routes/team/definition.ts"] },
}, destinations: {
"src/routes/item/definition.ts": () => definition0,
"src/routes/member/definition.ts": () => definition1,
"src/routes/old-item/definition.ts": () => definition2,
"src/routes/product/definition.ts": () => definition3,
"src/routes/report/definition.ts": () => definition4,
"src/routes/team/definition.ts": () => definition5,
}, absolute: {"/teams/$teamId/items/$id":"src/routes/item/definition.ts","/teams/$teamId/members/$memberId":"src/routes/member/definition.ts","/teams/$teamId/old-items/$id":"src/routes/old-item/definition.ts","/products/$productId":"src/routes/product/definition.ts","/reports/$reportId":"src/routes/report/definition.ts","/teams/$teamId":"src/routes/team/definition.ts"}, relative: {"src/routes/item/definition.ts":{"./":"src/routes/item/definition.ts","../$id":"src/routes/item/definition.ts","../../items/$id":"src/routes/item/definition.ts","../../members/$memberId":"src/routes/member/definition.ts","../../old-items/$id":"src/routes/old-item/definition.ts","../..":"src/routes/team/definition.ts","../../":"src/routes/team/definition.ts","../../../$teamId/items/$id":"src/routes/item/definition.ts","../../../$teamId/members/$memberId":"src/routes/member/definition.ts","../../../$teamId/old-items/$id":"src/routes/old-item/definition.ts","../../../$teamId":"src/routes/team/definition.ts","../../../../teams/$teamId/items/$id":"src/routes/item/definition.ts","../../../../teams/$teamId/members/$memberId":"src/routes/member/definition.ts","../../../../teams/$teamId/old-items/$id":"src/routes/old-item/definition.ts","../../../../products/$productId":"src/routes/product/definition.ts","../../../../reports/$reportId":"src/routes/report/definition.ts","../../../../teams/$teamId":"src/routes/team/definition.ts"},"src/routes/member/definition.ts":{"./":"src/routes/member/definition.ts","../$memberId":"src/routes/member/definition.ts","../../items/$id":"src/routes/item/definition.ts","../../members/$memberId":"src/routes/member/definition.ts","../../old-items/$id":"src/routes/old-item/definition.ts","../..":"src/routes/team/definition.ts","../../":"src/routes/team/definition.ts","../../../$teamId/items/$id":"src/routes/item/definition.ts","../../../$teamId/members/$memberId":"src/routes/member/definition.ts","../../../$teamId/old-items/$id":"src/routes/old-item/definition.ts","../../../$teamId":"src/routes/team/definition.ts","../../../../teams/$teamId/items/$id":"src/routes/item/definition.ts","../../../../teams/$teamId/members/$memberId":"src/routes/member/definition.ts","../../../../teams/$teamId/old-items/$id":"src/routes/old-item/definition.ts","../../../../products/$productId":"src/routes/product/definition.ts","../../../../reports/$reportId":"src/routes/report/definition.ts","../../../../teams/$teamId":"src/routes/team/definition.ts"},"src/routes/product/definition.ts":{"./":"src/routes/product/definition.ts","../$productId":"src/routes/product/definition.ts","../../teams/$teamId/items/$id":"src/routes/item/definition.ts","../../teams/$teamId/members/$memberId":"src/routes/member/definition.ts","../../teams/$teamId/old-items/$id":"src/routes/old-item/definition.ts","../../products/$productId":"src/routes/product/definition.ts","../../reports/$reportId":"src/routes/report/definition.ts","../../teams/$teamId":"src/routes/team/definition.ts"},"src/routes/report/definition.ts":{"./":"src/routes/report/definition.ts","../$reportId":"src/routes/report/definition.ts","../../teams/$teamId/items/$id":"src/routes/item/definition.ts","../../teams/$teamId/members/$memberId":"src/routes/member/definition.ts","../../teams/$teamId/old-items/$id":"src/routes/old-item/definition.ts","../../products/$productId":"src/routes/product/definition.ts","../../reports/$reportId":"src/routes/report/definition.ts","../../teams/$teamId":"src/routes/team/definition.ts"},"src/routes/team/definition.ts":{"./items/$id":"src/routes/item/definition.ts","./members/$memberId":"src/routes/member/definition.ts","./old-items/$id":"src/routes/old-item/definition.ts","./":"src/routes/team/definition.ts","../$teamId/items/$id":"src/routes/item/definition.ts","../$teamId/members/$memberId":"src/routes/member/definition.ts","../$teamId/old-items/$id":"src/routes/old-item/definition.ts","../$teamId":"src/routes/team/definition.ts","../../teams/$teamId/items/$id":"src/routes/item/definition.ts","../../teams/$teamId/members/$memberId":"src/routes/member/definition.ts","../../teams/$teamId/old-items/$id":"src/routes/old-item/definition.ts","../../products/$productId":"src/routes/product/definition.ts","../../reports/$reportId":"src/routes/report/definition.ts","../../teams/$teamId":"src/routes/team/definition.ts"}} };
export function getRouteSet(): RouteSet { return routeSet; }
