# @loozo/ng-lucide

## Installation

```sh
npm i @loozo/ng-lucide
```

## Usage

```angular-ts
import { Component } from '@angular/core';
import { LucideCheck } from '@loozo/ng-lucide';

@Component({
  selector: 'app-comp',
  standalone: true,
  imports: [LucideCheck],
  template: `
    <div class="flex gap-4">
      <lucide-check class="w-4 h-4" /> It works!
    </div>
  `
})
export class Something {}
```
