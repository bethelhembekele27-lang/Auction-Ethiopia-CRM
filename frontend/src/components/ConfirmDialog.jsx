export default function ConfirmDialog({ pending, onCancel, onConfirm }) {
  if (!pending) return null;
  return (
    <div className="fixed inset-0 bg-[rgba(20,23,28,0.45)] flex items-center justify-center z-[100] p-6" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="bg-[color:var(--panel)] text-[color:var(--text)] rounded-xl w-full p-6" style={{ maxWidth: 400 }}>
        <div style={{ fontSize: 14, marginBottom: 18 }}>{pending.message}</div>
        <div className="flex gap-2">
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--red)] bg-[color:var(--red-bg)] text-[color:var(--red)] cursor-pointer" onClick={onConfirm}>Delete permanently</button>
          <button className="font-sans text-[13px] font-medium px-3.5 py-2 rounded-[5px] border border-[color:var(--border)] bg-transparent text-[color:var(--text)] cursor-pointer" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}