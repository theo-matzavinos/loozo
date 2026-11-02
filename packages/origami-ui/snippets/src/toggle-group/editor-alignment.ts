import { Directive, Service, computed, inject, input, signal } from "@angular/core";
import {
  OrigamiToggleGroupSingle,
  OrigamiToggleGroupSingleOptions,
  OrigamiToggleGroupItem,
  OrigamiToggleGroupItemOptions,
  type OrigamiToggleGroupOrientation,
} from "@loozo/origami-ui/toggle-group";
import { injectUniqueId } from "@loozo/origami-ui/utils";

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

// An item whose disabled state comes from a domain record. Its `value` input also sets the
// composed item's required one: <button [appAlignment]="alignment" [value]="alignment.id">.
@Directive({
  selector: "button[appAlignment]",
  hostDirectives: [{ directive: OrigamiToggleGroupItem, inputs: ["value"] }],
  providers: [OrigamiToggleGroupItemOptions.provideExisting(() => AlignmentOption)],
})
export class AlignmentOption implements OrigamiToggleGroupItemOptions {
  readonly alignment = input.required<Alignment>({ alias: "appAlignment" });
  readonly value = input.required<string>();
  readonly disabled = computed(() => !this.alignment().available);
  readonly focusableWhenDisabled = signal(false);
  readonly id = input(injectUniqueId("alignment"));
}
