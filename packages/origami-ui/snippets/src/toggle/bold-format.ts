import { Directive, Service, inject, signal } from "@angular/core";
import { OrigamiToggle, OrigamiToggleOptions } from "@loozo/origami-ui/toggle";

@Service()
export class Editor {
  readonly bold = signal(false);
  readonly readonly = signal(false);
}

// A Toggle driven by editor state instead of the directive's own `pressed` model.
@Directive({
  selector: "button[appBoldFormat]",
  hostDirectives: [OrigamiToggle],
  providers: [
    OrigamiToggleOptions.provideFactory(() => {
      const editor = inject(Editor);

      return {
        pressed: editor.bold,
        disabled: editor.readonly,
        focusableWhenDisabled: signal(false),
      };
    }),
  ],
})
export class BoldFormat {}
