import { NgDocPage } from '@ng-doc/core';
import components from '../ng-doc.category';
import { RadianTabsGroup, RadianTabsImports } from '@loozo/radian/tabs';

const tabs: NgDocPage = {
  title: `Tabs`,
  mdFile: './index.md',
  category: components,
  imports: [RadianTabsImports],
  playgrounds: {
    TabsPlayground: {
      target: RadianTabsGroup,
      defaults: {
        orientation: 'horizontal',
      },
      template: `
        <div radianTabsGroup>
          <div radianTabsTriggersList class="inline-flex data-[orientation=vertical]:flex-col h-10 data-[orientation=vertical]:h-auto items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
            <button class="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm" radianTabTrigger [for]="tab1">Tab 1</button>
            <button class="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm" radianTabTrigger [for]="tab2">Tab 2</button>
          </div>

          <ng-container radianTab #tab1="radianTab">
            <div class="mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" radianTabContent>
              Static content
            </div>
          </ng-container>

          <ng-container radianTab #tab2="radianTab">
            <div *radianTabContentPresence class="mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" radianTabContent>
              Lazy content
            </div>
          </ng-container>
        </div>
      `,
    },
  },
};

export default tabs;
