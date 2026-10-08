/* ================================================================
   PAGINATION — Previous / Next controls shown below list tables.
   Only renders when there is more than one page of records.

   Props:
     page        — current 1-based page number
     totalPages  — total number of pages (based on filtered count)
     total       — total number of filtered records
     onChange    — (newPage: number) => void
================================================================= */

export default function Pagination({ page, totalPages, total, onChange }) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between mt-3 px-1">
      <span className="text-[13px] text-[color:var(--text-3)]">
        Showing {total} record{total === 1 ? "" : "s"}
      </span>

      <div className="flex items-center gap-2">
        <button
          className="font-sans text-[13px] font-medium px-3 py-[5px] rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Previous
        </button>

        <span className="text-[13px] text-[color:var(--text-3)] select-none">
          {page} / {totalPages}
        </span>

        <button
          className="font-sans text-[13px] font-medium px-3 py-[5px] rounded-[5px] border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] cursor-pointer hover:border-[color:var(--text-3)] disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
