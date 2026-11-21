import { Component, input } from "@angular/core";
import {
  OrigamiScrollArea,
  OrigamiScrollAreaContent,
  OrigamiScrollAreaScrollbar,
  OrigamiScrollAreaThumb,
  OrigamiScrollAreaViewport,
} from "@loozo/origami-ui/scroll-area";

interface Address {
  readonly name: string;
  readonly street: string;
  readonly city: string;
  readonly country: string;
  readonly phone: string;
}

const addresses: Address[] = [];

for (let index = 1; index <= 30; index++) {
  addresses.push({
    name: `Customer ${index}`,
    street: `${index} Ermou Street`,
    city: "Athens",
    country: "Greece",
    phone: `+30 210 000 ${String(index).padStart(4, "0")}`,
  });
}

// A table that scrolls both ways inside a fixed box. The bars are this component's own elements:
// overlaid on the viewport's edge, shown while the pointer is over the table or it scrolls, and
// hidden `hideDelay` ms later. The horizontal track stops at the vertical one while both overflow.
@Component({
  selector: "app-address-table",
  imports: [
    OrigamiScrollArea,
    OrigamiScrollAreaViewport,
    OrigamiScrollAreaContent,
    OrigamiScrollAreaScrollbar,
    OrigamiScrollAreaThumb,
  ],
  template: `
    <div ogScrollArea [hideDelay]="hideDelay()" class="scroll-area">
      <div ogScrollAreaViewport class="viewport" role="region" aria-label="Addresses">
        <div ogScrollAreaContent>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Street</th>
                <th>City</th>
                <th>Country</th>
                <th>Phone</th>
              </tr>
            </thead>
            <tbody>
              @for (address of addresses; track address.name) {
                <tr>
                  <td>{{ address.name }}</td>
                  <td>{{ address.street }}</td>
                  <td>{{ address.city }}</td>
                  <td>{{ address.country }}</td>
                  <td>{{ address.phone }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      <div ogScrollAreaScrollbar orientation="vertical" class="scrollbar">
        <div ogScrollAreaThumb class="thumb"></div>
      </div>
      <div ogScrollAreaScrollbar orientation="horizontal" class="scrollbar">
        <div ogScrollAreaThumb class="thumb"></div>
      </div>
    </div>
  `,
  styles: `
    .scroll-area {
      position: relative;
      inline-size: min(100%, 28rem);
      block-size: 15rem;
      border: 1px solid var(--border, #64748b);
      border-radius: 0.5rem;
      overflow: hidden;
    }

    .viewport {
      block-size: 100%;
    }

    .viewport:focus-visible {
      outline: 2px solid var(--ring, #2563eb);
      outline-offset: -2px;
    }

    table {
      border-collapse: collapse;
    }

    th,
    td {
      padding: 0.5rem 0.75rem;
      text-align: start;
      white-space: nowrap;
    }

    .scrollbar {
      position: absolute;
      box-sizing: border-box;
      padding: 1px;
      overflow: clip;
      touch-action: none;
      visibility: hidden;
      opacity: 0;
      transition:
        opacity 150ms,
        visibility 0s 150ms;
    }

    .scrollbar[data-visible] {
      visibility: visible;
      opacity: 1;
      transition: opacity 150ms;
    }

    .scrollbar[data-orientation="vertical"] {
      inset-block: 0;
      inset-inline-end: 0;
      inline-size: 10px;
    }

    .scrollbar[data-orientation="horizontal"] {
      inset-inline: 0;
      inset-block-end: 0;
      block-size: 10px;
    }

    .scroll-area[data-overflow-y] > .scrollbar[data-orientation="horizontal"] {
      inset-inline-end: 10px;
    }

    .scroll-area[data-overflow-x] > .scrollbar[data-orientation="vertical"] {
      inset-block-end: 10px;
    }

    .thumb {
      box-sizing: border-box;
      border-radius: 9999px;
      background: var(--border, #64748b);
    }

    .scrollbar[data-orientation="vertical"] .thumb {
      min-block-size: 18px;
    }

    .scrollbar[data-orientation="horizontal"] .thumb {
      block-size: 100%;
      min-inline-size: 18px;
    }

    @media (forced-colors: active) {
      .scrollbar {
        forced-color-adjust: none;
        background: Canvas;
      }

      .thumb {
        forced-color-adjust: none;
        background: CanvasText;
        border: 1px solid Canvas;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .scrollbar,
      .scrollbar[data-visible] {
        transition: none;
      }
    }
  `,
})
export class AddressTable {
  /** How long the bars stay after the pointer leaves or scrolling stops, in ms. */
  readonly hideDelay = input(600);
  readonly addresses = addresses;
}
