import { Directive, input } from "@angular/core";
import { OrigamiCollectionItem, OrigamiCollectionItemOptions } from "@loozo/origami-ui/collection";

// A consumer item that takes its required value from its own attribute: <li appTag="billing">.
@Directive({
  selector: "[appTag]",
  hostDirectives: [OrigamiCollectionItem],
  providers: [OrigamiCollectionItemOptions.provideExisting(() => Tag)],
})
export class Tag implements OrigamiCollectionItemOptions {
  readonly value = input.required<string>({ alias: "appTag" });
}
