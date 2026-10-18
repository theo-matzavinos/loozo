import { Directive, Service, inject, signal } from "@angular/core";
import { OrigamiButton, OrigamiButtonOptions } from "@loozo/origami-ui/button";

@Service()
export class Editor {
  readonly readOnly = signal(false);
}

// A command button disabled by the editor's state instead of its own input, kept focusable so
// users can still find it.
@Directive({
  selector: "button[appEditorCommand]",
  hostDirectives: [OrigamiButton],
  providers: [OrigamiButtonOptions.provideExisting(() => EditorCommand)],
})
export class EditorCommand implements OrigamiButtonOptions {
  readonly disabled = inject(Editor).readOnly;
  readonly focusableWhenDisabled = signal(true);
}
