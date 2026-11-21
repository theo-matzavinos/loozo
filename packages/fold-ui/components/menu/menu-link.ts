import { Directive, computed, input } from "@angular/core";
import { OrigamiMenuLink } from "@loozo/origami-ui/menu";
import { cn } from "../cn";
import { menuItemClasses } from "../popup";

/** A menu row that navigates, with `href` or `routerLink`; it looks like a MenuItem. */
@Directive({
  selector: "a[fold__MenuLink]",
  hostDirectives: [{ directive: OrigamiMenuLink, inputs: ["label"], outputs: ["select"] }],
  host: { "data-slot": "menu-link", "[class]": "classes()" },
})
export class MenuLink {
  readonly class = input("");

  protected readonly classes = computed(() => cn(menuItemClasses, this.class()));
}
