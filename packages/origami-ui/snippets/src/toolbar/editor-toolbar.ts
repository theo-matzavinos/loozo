import { Directive, Service, computed, inject, input, signal } from "@angular/core";
import {
  OrigamiToolbar,
  OrigamiToolbarOptions,
  OrigamiToolbarState,
  OrigamiToolbarItem,
  type OrigamiToolbarOrientation,
} from "@loozo/origami-ui/toolbar";
import { OrigamiButtonOptions } from "@loozo/origami-ui/button";

@Service()
export class EditorLayout {
  readonly toolbarOrientation = signal<OrigamiToolbarOrientation>("horizontal");
  readonly readOnly = signal(false);
}

// The application owns the orientation; the primitive owns roving focus.
@Directive({
  selector: "[appEditorToolbar]",
  hostDirectives: [OrigamiToolbar],
  providers: [
    OrigamiToolbarOptions.provideFactory(() => ({
      orientation: inject(EditorLayout).toolbarOrientation,
    })),
  ],
  host: { "aria-label": "Editor" },
})
export class EditorToolbar {}

export type Command = { readonly available: boolean; run(): void };

// A command whose disabled state comes from the domain. A Toolbar item takes Button's Options.
@Directive({
  selector: "button[appCommand]",
  hostDirectives: [OrigamiToolbarItem],
  providers: [OrigamiButtonOptions.provideExisting(() => EditorCommand)],
  host: { "(click)": "command().run()" },
})
export class EditorCommand implements OrigamiButtonOptions {
  readonly command = input.required<Command>({ alias: "appCommand" });
  readonly #layout = inject(EditorLayout);
  readonly disabled = computed(() => this.#layout.readOnly() || !this.command().available);
  readonly focusableWhenDisabled = signal(false);
}

// A separator perpendicular to the effective Toolbar orientation.
@Directive({
  selector: "[appEditorSeparator]",
  host: { role: "separator", "[attr.aria-orientation]": "orientation()" },
})
export class EditorSeparator {
  readonly #toolbar = inject(OrigamiToolbarState);
  protected readonly orientation = computed(() => {
    if (this.#toolbar.orientation() === "horizontal") {
      return "vertical";
    }

    return "horizontal";
  });
}
