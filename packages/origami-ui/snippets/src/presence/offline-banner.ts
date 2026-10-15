import { Directive, Service, inject, signal } from "@angular/core";
import { OrigamiPresence, OrigamiPresenceOptions } from "@loozo/origami-ui/presence";

@Service()
export class Connection {
  readonly offline = signal(false);
}

// Presence driven by application state instead of the directive's own `present` model.
@Directive({
  selector: "[appOfflineBanner]",
  hostDirectives: [OrigamiPresence],
  providers: [
    OrigamiPresenceOptions.provideFactory(() => {
      return { present: inject(Connection).offline };
    }),
  ],
})
export class OfflineBanner {}
