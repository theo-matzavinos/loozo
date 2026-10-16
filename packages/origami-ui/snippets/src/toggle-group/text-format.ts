import { Component, signal } from "@angular/core";
import { OrigamiToggleGroupMultiple, OrigamiToggleGroupItem } from "@loozo/origami-ui/toggle-group";

@Component({
  selector: "app-text-format",
  imports: [OrigamiToggleGroupMultiple, OrigamiToggleGroupItem],
  template: `
    <div
      ogToggleGroupMultiple
      orientation="vertical"
      [(value)]="marks"
      aria-label="Text formatting"
    >
      <button ogToggleGroupItem class="mark" value="bold" aria-label="Bold"><b>B</b></button>
      <button ogToggleGroupItem class="mark" value="italic" aria-label="Italic"><i>I</i></button>
      <button ogToggleGroupItem class="mark" value="underline" aria-label="Underline">
        <u>U</u>
      </button>
    </div>
  `,
  styles: `
    .mark[data-pressed] {
      background: var(--accent);
    }
  `,
})
export class TextFormat {
  readonly marks = signal<readonly string[]>(["bold"]);
}
