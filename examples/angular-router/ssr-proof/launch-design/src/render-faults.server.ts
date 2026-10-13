import { InjectionToken } from "@angular/core";

interface RenderFaults {
  unsupportedContext?: Error;
}

// Root means this render's application injector, not a module/process singleton.
export const RENDER_FAULTS = new InjectionToken<RenderFaults>("Launch render faults", {
  providedIn: "root",
  factory: () => ({}),
});
