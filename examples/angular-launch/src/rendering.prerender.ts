import { RenderMode } from "@angular/ssr";
import type { ServerRoute } from "@angular/ssr";

export const rendering: ServerRoute[] = [
  { path: "about", renderMode: RenderMode.Prerender },
  { path: "static", renderMode: RenderMode.Prerender },
  { path: "**", renderMode: RenderMode.Server },
];
