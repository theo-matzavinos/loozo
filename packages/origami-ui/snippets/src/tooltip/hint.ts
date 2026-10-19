import { Directive, input } from "@angular/core";
import {
  OrigamiTooltipContent,
  OrigamiTooltipContentOptions,
  type OrigamiTooltipAlign,
  type OrigamiTooltipSide,
} from "@loozo/origami-ui/tooltip";
import { injectUniqueId } from "@loozo/origami-ui/utils";

// Content replacements supply all four fields; this one places hints below their Trigger.
@Directive({
  selector: "[appHint]",
  hostDirectives: [OrigamiTooltipContent],
  providers: [OrigamiTooltipContentOptions.provideExisting(() => Hint)],
})
export class Hint implements OrigamiTooltipContentOptions {
  readonly id = input(injectUniqueId("hint"));
  readonly side = input<OrigamiTooltipSide>("block-end");
  readonly align = input<OrigamiTooltipAlign>("start");
  readonly gap = input(4);
}
