import { defineRoute } from "@loozo/angular-launch";
import parent from "../route";

// A parent of its own, so its catchall child doesn't compete with the root catchall.
export default defineRoute("help", { parent });
