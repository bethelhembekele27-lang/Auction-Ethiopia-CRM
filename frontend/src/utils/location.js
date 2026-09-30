// MUST stay byte-for-byte equivalent to the backend's crm.models.address_key
// — both sides derive a SavedLocation lookup key from an address, and if the
// two normalizations ever disagree the frontend would fail to match a saved
// location the backend happily stores (and vice versa), silently duplicating
// every row.
export const normalizeAddress = (s) =>
  (s || "").toLowerCase().split(/\s+/).filter(Boolean).join(" ");
