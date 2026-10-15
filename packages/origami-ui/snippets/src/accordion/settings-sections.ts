import { Directive, Service, inject, signal } from "@angular/core";
import {
  OrigamiAccordionMultiple,
  OrigamiAccordionMultipleOptions,
} from "@loozo/origami-ui/accordion";

@Service()
export class SettingsLayout {
  readonly openSections = signal<readonly string[]>(["profile"]);
  readonly locked = signal(false);
}

// Selection lives in an application service; user toggles write new arrays into it.
@Directive({
  selector: "[appSettingsSections]",
  hostDirectives: [OrigamiAccordionMultiple],
  providers: [
    OrigamiAccordionMultipleOptions.provideFactory(() => {
      const layout = inject(SettingsLayout);

      return { value: layout.openSections, disabled: layout.locked };
    }),
  ],
})
export class SettingsSections {}
