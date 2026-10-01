import { Modal } from "./ui";

// Click-anywhere detail view for a table row. fields is an array of
// [label, value] — or [label, value, true] for a full-width row — where
// value may be any React node. A falsy value renders as an em dash so
// fields don't need conditional logic at every call site.
export default function RowDetail({ title, fields, onClose, onEdit }) {
  return (
    <Modal open={!!fields} onClose={onClose} title={title} wide>
      {fields && (
        <>
          <div className="grid grid-cols-2 gap-y-3.5 gap-x-5">
            {fields.map(([label, value, full]) => (
              <div key={label} className={full ? "col-span-2" : ""}>
                <div className="text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-3)] mb-1">{label}</div>
                <div className="text-sm break-words whitespace-pre-wrap">{value || value === 0 ? value : "—"}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-3.5 border-t border-[color:var(--border)] mt-3.5">
            {onEdit && <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--brass)] bg-[color:var(--brass)] text-white cursor-pointer" onClick={onEdit}>Edit</button>}
            <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-transparent cursor-pointer" onClick={onClose}>Close</button>
          </div>
        </>
      )}
    </Modal>
  );
}