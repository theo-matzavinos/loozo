import { Component } from '@angular/core';

import { AnalogWelcomeComponent } from './analog-welcome.component';

@Component({
  selector: 'example-home',
  standalone: true,
  imports: [AnalogWelcomeComponent],
  template: ` <example-analog-welcome /> `,
})
export default class HomeComponent {}
