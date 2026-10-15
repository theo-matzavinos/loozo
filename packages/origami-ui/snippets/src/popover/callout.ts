import { Directive, input } from "@angular/core";
import {
  OrigamiPopoverContent,
  OrigamiPopoverContentOptions,
  type OrigamiPopoverAlign,
  type OrigamiPopoverSide,
} from "@loozo/origami-ui/popover";
import { injectUniqueId } from "@loozo/origami-ui/utils";

// Content replacements supply all four fields; this one places callouts beside their anchor.
@Directive({
  selector: "[appCallout]",
  hostDirectives: [OrigamiPopoverContent],
  providers: [OrigamiPopoverContentOptions.provideExisting(() => Callout)],
})
export class Callout implements OrigamiPopoverContentOptions {
  readonly id = input(injectUniqueId("callout"));
  readonly side = input<OrigamiPopoverSide>("inline-end");
  readonly align = input<OrigamiPopoverAlign>("center");
  readonly gap = input(12);
}
