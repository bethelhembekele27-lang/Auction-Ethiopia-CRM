import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import AutoCompleteField from "./AutoCompleteField";
import { Field, inputCls } from "./ui";
import { locations as locationsApi } from "../api";
import { normalizeAddress } from "../utils/location";

// Shared by the Visit Setup form and the Custom visit form so both write
// saved locations the same way. Everything here is deliberately fail-soft: a
// saved-location fetch or save must never block someone from registering a
// visit, so errors are swallowed rather than surfaced.
export function useSavedLocations() {
  const [list, setList] = useState([]);
  const [choice, setChoice] = useState("once"); // "once" | "save"

  useEffect(() => {
    let alive = true;
    locationsApi.listLocations()
      .then((r) => { if (alive && Array.isArray(r)) setList(r); })
      .catch(() => {}); // fail soft: forms still work without it
    return () => { alive = false; };
  }, []);

  const byKey = useMemo(
    () => new Map(list.map((l) => [normalizeAddress(l.address), l])),
    [list]
  );

  // New address -> quietly saved. Known address with a different link -> only if choice === "save".
  const persist = useCallback(async (address, link, how = "once") => {
    const addr = (address || "").trim(), url = (link || "").trim();
    if (!addr || !url) return;
    const match = byKey.get(normalizeAddress(addr));
    if (match && (match.mapsLink === url || how !== "save")) return;
    try {
      await locationsApi.saveLocation(addr, url);
      setList((prev) => [
        ...prev.filter((l) => normalizeAddress(l.address) !== normalizeAddress(addr)),
        { address: addr, mapsLink: url },
      ]);
    } catch { /* fail soft */ }
  }, [byKey]);

  return { list, byKey, choice, setChoice, persist };
}

// Renders inside a grid-cols-2 form. onChange receives a partial { address, mapsLink }.
export default function LocationFields({ loc, address, mapsLink, onChange, addressLabel = "Address" }) {
  // Tracks the link WE autofilled, so a later keystroke can tell "the user
  // typed this link" (never overwrite it) apart from "this link is just what
  // we filled in for them" (safe to discard).
  const lastAuto = useRef("");
  const link = mapsLink || "";
  const match = loc.byKey.get(normalizeAddress(address));
  const differs = match && link.trim() && link.trim() !== match.mapsLink;

  function handleAddress(v) {
    const m = loc.byKey.get(normalizeAddress(v));
    let next = link;
    if (m && (!link || link === lastAuto.current)) {
      next = m.mapsLink;            // autofill, but never over a manually typed link
      lastAuto.current = m.mapsLink;
    } else if (!m && link && link === lastAuto.current) {
      next = "";                    // address moved off the saved one; drop the stale autofill
      lastAuto.current = "";
    }
    loc.setChoice("once");
    onChange({ address: v, mapsLink: next });
  }

  return (
    <>
      <Field label={addressLabel} full>
        <AutoCompleteField value={address || ""} onChange={handleAddress}
          options={loc.list.map((l) => l.address)}
          placeholder="Choose a saved place or type a new one" />
      </Field>
      <Field label="Google Maps link" full>
        <input className={inputCls} placeholder="https://maps.google.com/…" value={link}
          onChange={(e) => onChange({ address, mapsLink: e.target.value })} />
      </Field>
      {differs && (
        <div className="col-span-2 text-[12.5px] bg-[color:var(--paper)] rounded-md px-3 py-2.5 flex flex-col gap-1.5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="linkChoice" checked={loc.choice === "once"} onChange={() => loc.setChoice("once")} />
            Use it just this once (saved link for "{address}" stays unchanged)
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="linkChoice" checked={loc.choice === "save"} onChange={() => loc.setChoice("save")} />
            Save this link for "{address}" next time
          </label>
        </div>
      )}
    </>
  );
}
