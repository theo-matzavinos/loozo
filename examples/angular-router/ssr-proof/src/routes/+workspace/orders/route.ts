import { defineRoute } from "@loozo/angular-router";
import workspace from "../route.js";

export default defineRoute("orders", { parent: workspace }).resolve({ label: () => "orders" });
