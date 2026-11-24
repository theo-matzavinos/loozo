import { Table } from "./table";
import { TableCell } from "./table-cell";
import { TableColumnHeader } from "./table-column-header";
import { TableFrame } from "./table-frame";
import { TablePager } from "./table-pager";
import { TableRow } from "./table-row";
import { TableSortButton } from "./table-sort-button";

/** Every Table part, for a component's `imports`. */
export const TableParts = [
  TableFrame,
  Table,
  TableRow,
  TableColumnHeader,
  TableSortButton,
  TableCell,
  TablePager,
] as const;
