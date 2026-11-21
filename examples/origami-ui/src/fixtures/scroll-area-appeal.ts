import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  input,
  signal,
} from "@angular/core";
import {
  OrigamiAccordionItem,
  OrigamiAccordionPanel,
  OrigamiAccordionSingle,
  OrigamiAccordionTrigger,
} from "@loozo/origami-ui/accordion";
import {
  OrigamiScrollArea,
  OrigamiScrollAreaContent,
  OrigamiScrollAreaViewport,
} from "@loozo/origami-ui/scroll-area";
import { ScrollAreaStateProbe, ScrollBar, scrollAreaRecipe } from "./scroll-area.js";

const rows: number[] = [];

for (let row = 0; row < 20; row++) {
  rows.push(row);
}

/**
 * The etias appeal panel's shape: an OnPush composer of the root whose content switches between a
 * 1080 px table and a form whose width follows the page's breakpoints.
 */
@Component({
  selector: "appeal-area",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OrigamiScrollAreaViewport, OrigamiScrollAreaContent, ScrollAreaStateProbe, ScrollBar],
  hostDirectives: [OrigamiScrollArea],
  host: { class: "sa appeal-area" },
  template: `
    <div ogScrollAreaViewport class="sa-viewport" data-testid="appeal-viewport">
      <div ogScrollAreaContent scrollAreaStateProbe data-testid="appeal-content">
        @if (form()) {
          <form class="appeal-form" data-testid="appeal-form">
            @for (row of rows; track row) {
              <p class="appeal-row">Question {{ row }}</p>
            }
          </form>
        } @else {
          <table class="appeal-table" data-testid="appeal-table">
            <tbody>
              @for (row of rows; track row) {
                <tr>
                  <td>Decision {{ row }}</td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
    <scroll-bar orientation="vertical" data-testid="appeal-vbar" />
    <scroll-bar orientation="horizontal" data-testid="appeal-hbar" />
  `,
})
export class AppealArea {
  readonly form = input(false);
  readonly rows = rows;
}

// SA17: the area inside a collapsed Accordion item, so its first measurement sees a hidden panel.
@Component({
  selector: "acceptance-scroll-area-appeal-fixture",
  encapsulation: ViewEncapsulation.None,
  imports: [
    OrigamiAccordionSingle,
    OrigamiAccordionItem,
    OrigamiAccordionTrigger,
    OrigamiAccordionPanel,
    AppealArea,
  ],
  styles: `
    ${scrollAreaRecipe}

    .appeal-area {
      display: block;
      inline-size: 500px;
      block-size: 200px;
    }
    .appeal-table {
      inline-size: 1080px;
    }
    .appeal-row {
      margin: 0;
      padding: 8px;
    }
    .appeal-form {
      inline-size: 400px;
    }
    @media (min-width: 680px) {
      .appeal-form {
        inline-size: 700px;
      }
    }
    @media (min-width: 900px) {
      .appeal-form {
        inline-size: 450px;
      }
    }
    @media (min-width: 1300px) {
      .appeal-form {
        inline-size: 1000px;
      }
    }
  `,
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach appeal fixture
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <button type="button" data-testid="appeal-switch" (click)="form.set(!form())">
      Switch the content
    </button>

    <section ogAccordionSingle [collapsible]="true">
      <article ogAccordionItem value="appeal">
        <h3><button ogAccordionTrigger data-testid="appeal-trigger">Appeal</button></h3>
        <div ogAccordionPanel data-testid="appeal-panel">
          <appeal-area data-testid="appeal" [form]="form()" />
        </div>
      </article>
    </section>
  `,
})
export class ScrollAreaAppealFixture {
  readonly attached = signal(false);
  readonly form = signal(false);
}
