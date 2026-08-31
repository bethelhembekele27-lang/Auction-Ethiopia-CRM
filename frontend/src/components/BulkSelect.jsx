/* ================================================================
   SHARED BULK-SELECT UI — checkbox column header/cell, and the
   floating action bar that appears once one or more rows are
   selected. Pairs with hooks/useRowSelection.js.

   Rendered directly inside <tr>, so HeaderCheckbox returns a <th>
   and RowCheckbox returns a <td> — matching how every other column
   in these tables is written (plain <th>/<td>, no wrapper row).
================================================================= */

export function HeaderCheckbox({ checked, onChange }) {
  return (
    <th className="py-2.5 px-3 border-b border-[color:var(--border)] w-8">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label="Select all rows"
        className="w-[15px] h-[15px] cursor-pointer"
      />
    </th>
  );
}

export function RowCheckbox({ checked, onChange, label }) {
  return (
    <td className="py-[11px] px-3 border-b border-[color:var(--border)] align-middle w-8">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={label}
        className="w-[15px] h-[15px] cursor-pointer"
      />
    </td>
  );
}

export function BulkActionBar({ count, onClear, children }) {
  if (!count) return null;
  return (
    <div
      className="flex items-center gap-3 flex-wrap bg-[color:var(--paper)] border border-[color:var(--border)] rounded-[8px] px-3.5 py-2.5"
      style={{ marginBottom: 14 }}
    >
      <span className="text-[13px] font-medium text-[color:var(--text)]">
        {count} selected
      </span>
      <div className="flex items-center gap-2 flex-wrap">
        {children}
      </div>
      <button
        className="font-sans text-[12.5px] font-medium text-[color:var(--text-3)] hover:text-[color:var(--text-2)] cursor-pointer bg-transparent border-none"
        style={{ marginLeft: "auto" }}
        onClick={onClear}
      >
        Clear selection
      </button>
    </div>
  );
}