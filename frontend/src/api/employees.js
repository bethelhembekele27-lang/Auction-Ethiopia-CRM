import { api } from "./client";

// GET /api/employees
export function listEmployees() {
  return api.get("/employees");
}

// POST /api/employees — administrator only
export function createEmployee(data) {
  return api.post("/employees", data);
}

// PATCH /api/employees/:id
export function updateEmployee(id, data) {
  return api.patch(/employees/${id}, data);
}

// PATCH /api/employees/:id/privileges
export function updateEmployeePrivileges(id, privileges) {
  return api.patch(/employees/${id}/privileges, { privileges });
}

// GET /api/roles
export function listRoles() {
  return api.get("/roles");
}

// POST /api/roles — new roles start with zero privileges
export function createRole(name) {
  return api.post("/roles", { name });
}