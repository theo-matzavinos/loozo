import { RadianRemoveScroll } from './lib/remove-scroll';
import { RadianRemoveScrollbar } from './lib/remove-scrollbar';

export const RadianRemoveScrollImports = [
  RadianRemoveScroll,
  RadianRemoveScrollbar,
] as const;

export {
  RadianRemoveScroll,
  RadianRemoveScrollContext,
  provideRadianRemoveScrollContext,
} from './lib/remove-scroll';
export {
  RadianRemoveScrollbar,
  RadianRemoveScrollbarOptions,
  provideRadianRemoveScrollbarOptions,
} from './lib/remove-scrollbar';
