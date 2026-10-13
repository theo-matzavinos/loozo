import { RenderMode } from "@angular/ssr";
import type { ServerRoute } from "@angular/ssr";

export const rendering: ServerRoute[] = [{ path: "**", renderMode: RenderMode.Server }];
