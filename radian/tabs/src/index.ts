import { RadianTab } from './lib/tab';
import { RadianTabContent } from './lib/tab-content';
import { RadianTabContentPresence } from './lib/tab-content-presence';
import { RadianTabTrigger } from './lib/tab-trigger';
import { RadianTabsGroup } from './lib/tabs-group';
import { RadianTabsTriggersList } from './lib/tabs-triggers-list';

export const RadianTabsImports = [
  RadianTabsGroup,
  RadianTabsTriggersList,
  RadianTabTrigger,
  RadianTab,
  RadianTabContent,
  RadianTabContentPresence,
] as const;

export { RadianTab } from './lib/tab';
export { RadianTabContent } from './lib/tab-content';
export { RadianTabContentPresence } from './lib/tab-content-presence';
export { RadianTabTrigger } from './lib/tab-trigger';
export { RadianTabsGroup } from './lib/tabs-group';
export { RadianTabsTriggersList } from './lib/tabs-triggers-list';
