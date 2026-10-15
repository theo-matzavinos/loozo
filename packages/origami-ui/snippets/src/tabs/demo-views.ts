import { Component, input, signal } from "@angular/core";
import {
  OrigamiTabs,
  OrigamiTabsList,
  OrigamiTabsTrigger,
  OrigamiTabsPanel,
} from "@loozo/origami-ui/tabs";

@Component({
  selector: "app-demo-views",
  imports: [OrigamiTabs, OrigamiTabsList, OrigamiTabsTrigger, OrigamiTabsPanel],
  template: `
    <section ogTabs #tabs="ogTabs" [(value)]="view">
      <div ogTabsList aria-label="Demo views">
        <button ogTabsTrigger value="output">Output</button>
        <button ogTabsTrigger value="source">Source</button>
        <button ogTabsTrigger value="playground" [disabled]="!playgroundReady()">Playground</button>
      </div>

      <div ogTabsPanel value="output"><ng-content select="[output]" /></div>
      <div ogTabsPanel value="source">
        <pre>{{ source() }}</pre>
      </div>
      <div ogTabsPanel value="playground">
        <!-- Render the heavy view only while its tab is selected. -->
        @if (tabs.state.value() === "playground") {
          <textarea aria-label="Playground source" [value]="source()"></textarea>
        }
      </div>
    </section>
  `,
})
export class DemoViews {
  readonly source = input("");
  readonly view = signal<string | null>("output");
  readonly playgroundReady = signal(false);
}
