import { defineRoute } from "@loozo/angular-launch";
import { stringParam } from "@loozo/angular-router";
import parent from "../route";

// A root branch without a static segment: its redirect frames carry no words.
export default defineRoute("$note", { parent, outlet: "aside", params: { note: stringParam } });
