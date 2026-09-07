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

export function createRole(name, defaultPrivileges = []) {
  return api.post("/roles", { name, defaultPrivileges });
}
export function deleteEmployee(id) {
  return api.del(`/employees/${id}`);
}
export function listRolesFull() {
  return api.get("/roles", { full: 1 });
}
export function deleteRole(key) {
  return api.del(`/roles/${key}/`);
}
// POST /api/employees/<id>/reset-password/ — administrator only. Unlike
// self-service change-password (api/auth.js), this needs no old password
// since it's the admin-recovers-a-locked-out-employee path.
export function resetEmployeePassword(id, newPassword) {
  return api.post(`/employees/${id}/reset-password/`, { newPassword });
}