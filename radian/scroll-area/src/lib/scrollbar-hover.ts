import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
})
export class RadianScrollbarHover {
  constructor() {}
}
