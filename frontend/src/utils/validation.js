const ET_PHONE_RE = /^(?:\+251|0)(9|7)\d{8}$/;

export function isValidEthiopianPhone(value) {
  if (!value) return false;
  const cleaned = value.replace(/[\s-]/g, "");
  return ET_PHONE_RE.test(cleaned);
}

export const PHONE_HINT = "Enter a valid Ethiopian number, e.g. 0912345678 or +251912345678";