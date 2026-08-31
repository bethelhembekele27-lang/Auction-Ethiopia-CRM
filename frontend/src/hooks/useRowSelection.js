import { useState, useCallback } from "react";

/* ================================================================
   SHARED ROW-SELECTION HOOK — used by every table page that has
   moved from per-row inline action buttons to checkbox-select +
   a single top action bar (BulkSelect.jsx).

   keyFn extracts a stable unique key from a row object (usually
   (row) => row.id) — selection is tracked as a Set of keys, not
   the row objects themselves, so it stays correct even if the
   underlying list re-fetches/re-renders with new object identities.
================================================================= */
export function useRowSelection(keyFn) {
  const [selected, setSelected] = useState(() => new Set());

  const toggle = useCallback((row) => {
    const key = keyFn(row);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, [keyFn]);

  const toggleAll = useCallback((rows) => {
    setSelected((prev) => {
      const allKeys = rows.map(keyFn);
      const allSelected = allKeys.length > 0 && allKeys.every((k) => prev.has(k));
      if (allSelected) return new Set();
      return new Set(allKeys);
    });
  }, [keyFn]);

  const isSelected = useCallback((row) => selected.has(keyFn(row)), [selected, keyFn]);

  const isAllSelected = useCallback((rows) => {
    if (!rows.length) return false;
    return rows.every((row) => selected.has(keyFn(row)));
  }, [selected, keyFn]);

  const selectedFrom = useCallback((rows) => rows.filter((row) => selected.has(keyFn(row))), [selected, keyFn]);

  const clear = useCallback(() => setSelected(new Set()), []);

  return {
    selected,
    selectedCount: selected.size,
    toggle,
    toggleAll,
    isSelected,
    isAllSelected,
    selectedFrom,
    clear,
  };
}