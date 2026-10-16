import { Directive, Service, computed, inject, input, signal } from "@angular/core";
import {
  OrigamiToggleGroupSingle,
  OrigamiToggleGroupSingleOptions,
  OrigamiToggleGroupItem,
  OrigamiToggleGroupItemOptions,
  type OrigamiToggleGroupOrientation,
} from "@loozo/origami-ui/toggle-group";

@Service()
export class EditorSettings {
  readonly alignment = signal<string | null>("start");
  readonly readOnly = signal(false);
}

// A Single group driven by editor state instead of the directive's own `value` model.
@Directive({
  selector: "[appEditorAlignment]",
  hostDirectives: [OrigamiToggleGroupSingle],
  providers: [
    OrigamiToggleGroupSingleOptions.provideFactory(() => {
      const editor = inject(EditorSettings);

      return {
        value: editor.alignment,
        disabled: editor.readOnly,
        orientation: signal<OrigamiToggleGroupOrientation>("horizontal"),
        deselectable: signal(false),
      };
    }),
  ],
  host: { "aria-label": "Text alignment" },
})
export class EditorAlignment {}

export type Alignment = { readonly id: string; readonly available: boolean };

// An item whose value and disabled state come from a domain record. The group reads every
// item's Options while rendering, so the input has a default instead of being required.
@Directive({
  selector: "button[appAlignment]",
  hostDirectives: [OrigamiToggleGroupItem],
  providers: [OrigamiToggleGroupItemOptions.provideExisting(() => AlignmentOption)],
})
export class AlignmentOption implements OrigamiToggleGroupItemOptions {
  readonly alignment = input<Alignment>({ id: "", available: false }, { alias: "appAlignment" });
  readonly value = computed(() => this.alignment().id);
  readonly disabled = computed(() => !this.alignment().available);
}
