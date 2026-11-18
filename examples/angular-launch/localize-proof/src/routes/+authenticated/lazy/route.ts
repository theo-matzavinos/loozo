import { defineRoute } from "@loozo/angular-launch";
import parent from "../route";

// Componentless: its children load lazily, with their own words.
export default defineRoute("lazy", { parent });
