/**
 * Focuses the selected row of a selectable DataTable (its `tableRef`), or the
 * table itself when no row is selected (V-0.12.0-F4).
 */
export function focusSelectedRow(table: HTMLTableElement | null) {
  const row = table?.querySelector<HTMLElement>('tbody tr[aria-selected="true"]');
  (row ?? table)?.focus();
}
