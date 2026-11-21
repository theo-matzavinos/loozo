import { Component, signal } from "@angular/core";
import {
  OrigamiTabs,
  OrigamiTabsList,
  OrigamiTabsPanel,
  OrigamiTabsTrigger,
} from "@loozo/origami-ui/tabs";

@Component({
  selector: "bench-root, bench-tabs",
  imports: [OrigamiTabs, OrigamiTabsList, OrigamiTabsTrigger, OrigamiTabsPanel],
  template: `
    <section ogTabs [(value)]="view">
      <div ogTabsList aria-label="Demo views">
        <button ogTabsTrigger value="output">Output</button>
        <button ogTabsTrigger value="source">Source</button>
      </div>
      <div ogTabsPanel value="output"><p>Output</p></div>
      <div ogTabsPanel value="source"><pre>Source</pre></div>
    </section>
  `,
})
export class Workload {
  readonly view = signal<string | null>("output");
}
