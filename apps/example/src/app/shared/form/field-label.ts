import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Label } from '../label';

/** Component that renders a label for a field. */
@Component({
  selector: 'app-field-label',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [
    {
      directive: Label,
      inputs: ['class'],
    },
  ],
  template: `<ng-content />`,
})
export class FieldLabel {}
