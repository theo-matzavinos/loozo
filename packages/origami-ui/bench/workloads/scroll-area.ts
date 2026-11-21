import { Component } from "@angular/core";
import {
  OrigamiScrollArea,
  OrigamiScrollAreaContent,
  OrigamiScrollAreaScrollbar,
  OrigamiScrollAreaThumb,
  OrigamiScrollAreaViewport,
} from "@loozo/origami-ui/scroll-area";

@Component({
  selector: "bench-root, bench-scroll-area",
  imports: [
    OrigamiScrollArea,
    OrigamiScrollAreaViewport,
    OrigamiScrollAreaContent,
    OrigamiScrollAreaScrollbar,
    OrigamiScrollAreaThumb,
  ],
  template: `
    <div ogScrollArea>
      <div ogScrollAreaViewport role="region" aria-label="Addresses">
        <div ogScrollAreaContent>
          <table>
            <tbody>
              @for (row of rows; track row) {
                <tr>
                  <td>{{ row }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      <div ogScrollAreaScrollbar orientation="vertical">
        <div ogScrollAreaThumb></div>
      </div>
      <div ogScrollAreaScrollbar orientation="horizontal">
        <div ogScrollAreaThumb></div>
      </div>
    </div>
  `,
})
export class Workload {
  readonly rows = Array.from({ length: 20 }, (_, index) => `Address ${index + 1}`);
}
