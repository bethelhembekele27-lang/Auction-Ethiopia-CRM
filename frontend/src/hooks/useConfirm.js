import { useState, useCallback } from "react";

export function useConfirm() {
  const [pending, setPending] = useState(null); // { message, onConfirm }

  const confirm = useCallback((message, onConfirm) => {
    setPending({ message, onConfirm });
  }, []);

  const cancel = useCallback(() => setPending(null), []);

  async function run() {
    if (!pending) return;
    const { onConfirm } = pending;
    setPending(null);
    await onConfirm();
  }

  return { pending, confirm, cancel, run };
}