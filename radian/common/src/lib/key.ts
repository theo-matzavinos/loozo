import { RadianEnum } from './enum';

export const RadianKey = {
  Alt: 'Alt',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  ArrowUp: 'ArrowUp',
  Backspace: 'Backspace',
  CapsLock: 'CapsLock',
  Control: 'Control',
  Delete: 'Delete',
  End: 'End',
  Enter: 'Enter',
  Escape: 'Escape',
  F1: 'F1',
  F10: 'F10',
  F11: 'F11',
  F12: 'F12',
  F2: 'F2',
  F3: 'F3',
  F4: 'F4',
  F5: 'F5',
  F6: 'F6',
  F7: 'F7',
  F8: 'F8',
  F9: 'F9',
  Home: 'Home',
  Meta: 'Meta',
  PageDown: 'PageDown',
  PageUp: 'PageUp',
  Shift: 'Shift',
  Space: ' ',
  Tab: 'Tab',
  Ctrl: 'Control',
  Asterisk: '*',
  LowerA: 'a',
  UpperP: 'P',
  UpperA: 'A',
  LowerP: 'p',
  LowerN: 'n',
  LowerJ: 'j',
  LowerK: 'k',
} as const;

export type RadianKey = RadianEnum<typeof RadianKey>;

export const RadianArrowKeys: string[] = [
  RadianKey.ArrowDown,
  RadianKey.ArrowLeft,
  RadianKey.ArrowRight,
  RadianKey.ArrowUp,
];

export const RadianPageKeys: string[] = [RadianKey.PageUp, RadianKey.PageDown];
