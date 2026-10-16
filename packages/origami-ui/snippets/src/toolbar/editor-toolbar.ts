import { Directive, Service, computed, inject, input, signal } from "@angular/core";
import {
  OrigamiToolbar,
  OrigamiToolbarOptions,
  OrigamiToolbarState,
  OrigamiToolbarItem,
  OrigamiToolbarItemOptions,
  type OrigamiToolbarOrientation,
} from "@loozo/origami-ui/toolbar";

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

// A command whose disabled state comes from the domain. The Toolbar reads every item's Options
// while rendering, so the input has a default instead of being required.
@Directive({
  selector: "button[appCommand]",
  hostDirectives: [OrigamiToolbarItem],
  providers: [OrigamiToolbarItemOptions.provideExisting(() => EditorCommand)],
  host: { "(click)": "command().run()" },
})
export class EditorCommand implements OrigamiToolbarItemOptions {
  readonly command = input<Command>({ available: false, run: () => {} }, { alias: "appCommand" });
  readonly #layout = inject(EditorLayout);
  readonly disabled = computed(() => this.#layout.readOnly() || !this.command().available);
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
