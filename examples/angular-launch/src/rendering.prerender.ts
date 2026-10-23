import { RenderMode } from "@angular/ssr";
import type { ServerRoute } from "@angular/ssr";

export const rendering: ServerRoute[] = [
  { path: "identity", renderMode: RenderMode.Prerender },
  { path: "**", renderMode: RenderMode.Server },
];
