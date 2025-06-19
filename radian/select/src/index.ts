import { RadianSelectArrow } from './lib/select-arrow';
import { RadianSelectContent } from './lib/select-content';
import { RadianSelectGroup } from './lib/select-group';
import { RadianSelectIcon } from './lib/select-icon';
import { RadianSelectInput } from './lib/select-input';
import { RadianSelectItem } from './lib/select-item';
import { RadianSelectItemAlignedContent } from './lib/select-item-aligned-content';
import { RadianSelectItemAlignedPosition } from './lib/select-item-aligned-position';
import { RadianSelectItemText } from './lib/select-item-text';
import { RadianSelectLabel } from './lib/select-label';
import { RadianSelectMultiple } from './lib/select-multiple';
import {
  RadianSelectMultipleValue,
  RadianSelectMutltipleValueTemplate,
} from './lib/select-multiple-value';
import { RadianSelectPanel } from './lib/select-panel';
import { RadianSelectPopperContent } from './lib/select-popper-content';
import { RadianSelectPopperPosition } from './lib/select-popper-position';
import { RadianSelectPortal } from './lib/select-portal';
import { RadianSelectScrollDownButton } from './lib/select-scroll-down-button';
import { RadianSelectScrollUpButtonPresence } from './lib/select-scroll-down-button-presence';
import { RadianSelectScrollUpButton } from './lib/select-scroll-up-button';
import { RadianSelectScrollDownButtonPresence } from './lib/select-scroll-up-button-presence';
import { RadianSelectSeparator } from './lib/select-separator';
import { RadianSelectSingle } from './lib/select-single';
import {
  RadianSelectSingleValue,
  RadianSelectSingleValueTemplate,
} from './lib/select-single-value';
import { RadianSelectTrigger } from './lib/select-trigger';
import { RadianSelectViewport } from './lib/select-viewport';

const RadianSelectCommonImports = [
  RadianSelectContent,
  RadianSelectGroup,
  RadianSelectIcon,
  RadianSelectInput,
  RadianSelectItem,
  RadianSelectItemText,
  RadianSelectLabel,
  RadianSelectPanel,
  RadianSelectPortal,
  RadianSelectScrollDownButtonPresence,
  RadianSelectScrollDownButton,
  RadianSelectScrollUpButtonPresence,
  RadianSelectScrollUpButton,
  RadianSelectSeparator,
  RadianSelectTrigger,
  RadianSelectViewport,
] as const;

const RadianSelectPopperImports = [
  RadianSelectPopperContent,
  RadianSelectPopperPosition,
  RadianSelectArrow,
] as const;

const RadianSelectItemAlignedImports = [
  RadianSelectItemAlignedContent,
  RadianSelectItemAlignedPosition,
] as const;

const RadianSelectSingleImports = [
  RadianSelectSingleValue,
  RadianSelectSingleValueTemplate,
  RadianSelectSingle,
] as const;

const RadianSelectMultipleImports = [
  RadianSelectMultipleValue,
  RadianSelectMutltipleValueTemplate,
  RadianSelectMultiple,
] as const;

export const RadianSelectSinglePopperImports = [
  ...RadianSelectCommonImports,
  ...RadianSelectPopperImports,
  ...RadianSelectSingleImports,
] as const;

export const RadianSelectSingleItemAlignedImports = [
  ...RadianSelectCommonImports,
  ...RadianSelectItemAlignedImports,
  ...RadianSelectSingleImports,
] as const;

export const RadianSelectMultiplePopperImports = [
  ...RadianSelectCommonImports,
  ...RadianSelectPopperImports,
  ...RadianSelectMultipleImports,
] as const;

export const RadianSelectMultipleItemAlignedImports = [
  ...RadianSelectCommonImports,
  ...RadianSelectItemAlignedImports,
  ...RadianSelectMultipleImports,
] as const;

export const RadianSelectImports = [
  ...RadianSelectCommonImports,
  ...RadianSelectPopperImports,
  ...RadianSelectItemAlignedImports,
  ...RadianSelectSingleImports,
  ...RadianSelectMultipleImports,
] as const;
