import { defineRoute } from "@loozo/angular-launch";
import parent from "../../route";

// German "handbuecher/anfang"; "dokumente/anfang" would fall under docs/$rest[] and fail generation.
export default defineRoute("manuals/start", { parent });
