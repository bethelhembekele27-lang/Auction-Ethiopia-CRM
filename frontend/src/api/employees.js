import { api } from "./client";

export function listEmployees() {
  return api.get("/employees");
}

export function createEmployee(data) {
  return api.post("/employees", data);
}

export function updateEmployee(id, data) {
  return api.patch(`/employees/${id}`, data);
}

export function updateEmployeePrivileges(id, privileges) {
  return api.patch(`/employees/${id}/privileges`, { privileges });
}

export function listRoles() {
  return api.get("/roles");
}

export function createRole(name) {
  return api.post("/roles", { name });
}
export function deleteEmployee(id) {
  return api.del(`/employees/${id}`);
}