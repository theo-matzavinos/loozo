import {
  ChangeDetectionStrategy,
  Component,
  input,
  numberAttribute,
} from '@angular/core';

@Component({
  selector: 'radian-arrow',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-content>
      <svg
        [attr.width]="width()"
        [attr.height]="height()"
        viewBox="0 0 30 10"
        preserveAspectRatio="none"
      >
        <polygon points="0,0 30,0 15,10" />
      </svg>
    </ng-content>
  `,
})
export class RadianArrow {
  height = input(5, { transform: numberAttribute });
  width = input(10, { transform: numberAttribute });
}
