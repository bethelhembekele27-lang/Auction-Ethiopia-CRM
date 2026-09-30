import { api } from "./client";

export function listLocations() {
  return api.get("/locations");
}

export function saveLocation(address, mapsLink) {
  return api.post("/locations", { address, mapsLink });
}
