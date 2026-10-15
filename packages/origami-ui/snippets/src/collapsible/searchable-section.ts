import { Directive, booleanAttribute, input, model } from "@angular/core";
import {
  OrigamiCollapsible,
  OrigamiCollapsibleOptions,
  type OrigamiCollapsibleHiding,
} from "@loozo/origami-ui/collapsible";

// The replacement supplies every root field, here with `until-found` as its own default.
@Directive({
  selector: "[appSearchableSection]",
  hostDirectives: [OrigamiCollapsible],
  providers: [OrigamiCollapsibleOptions.provideExisting(() => SearchableSection)],
})
export class SearchableSection implements OrigamiCollapsibleOptions {
  readonly expanded = model(false);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly hiding = input<OrigamiCollapsibleHiding>("until-found");
}
