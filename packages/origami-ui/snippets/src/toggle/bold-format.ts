import { Directive, Service, inject, signal } from "@angular/core";
import { OrigamiToggle, OrigamiToggleOptions } from "@loozo/origami-ui/toggle";
import { injectUniqueId } from "@loozo/origami-ui/utils";

@Service()
export class Editor {
  readonly bold = signal(false);
  readonly readonly = signal(false);
}

// A Toggle driven by editor state instead of the directive's own `checked` model.
@Directive({
  selector: "button[appBoldFormat]",
  hostDirectives: [OrigamiToggle],
  providers: [
    OrigamiToggleOptions.provideFactory(() => {
      const editor = inject(Editor);

      return {
        checked: editor.bold,
        disabled: editor.readonly,
        focusableWhenDisabled: signal(false),
        id: signal(injectUniqueId("bold-format")),
      };
    }),
  ],
})
export class BoldFormat {}
