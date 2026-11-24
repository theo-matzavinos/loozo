import { defineRoute } from "@loozo/angular-router";
import other from "../route.js";

export default defineRoute("child", { parent: other });
