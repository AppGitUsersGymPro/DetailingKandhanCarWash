import api from './axios';

// ── Employees ─────────────────────────────────────────────────────────────────
export const listEmployees   = (params) => api.get('employees/', { params }).then(r => r.data);
export const createEmployee  = (data)   => api.post('employees/', data).then(r => r.data);
export const getEmployee     = (id)     => api.get(`employees/${id}/`).then(r => r.data);
export const updateEmployee  = (id, data) => api.put(`employees/${id}/`, data).then(r => r.data);
export const deleteEmployee  = (id)     => api.delete(`employees/${id}/`).then(r => r.data);

// ── Shifts ────────────────────────────────────────────────────────────────────
export const listShifts      = ()       => api.get('employees/shifts/').then(r => r.data);
export const createShift     = (data)   => api.post('employees/shifts/', data).then(r => r.data);
export const updateShift     = (id, data) => api.put(`employees/shifts/${id}/`, data).then(r => r.data);
export const deleteShift     = (id)     => api.delete(`employees/shifts/${id}/`).then(r => r.data);

// ── Attendance ────────────────────────────────────────────────────────────────
export const listAttendance  = (params) => api.get('employees/attendance/', { params }).then(r => r.data);
export const createAttendance  = (data) => api.post('employees/attendance/', data).then(r => r.data);
export const updateAttendance  = (id, data) => api.put(`employees/attendance/${id}/`, data).then(r => r.data);
export const deleteAttendance  = (id)   => api.delete(`employees/attendance/${id}/`).then(r => r.data);

// ── Salary Advances ───────────────────────────────────────────────────────────
export const listAdvances    = (params) => api.get('employees/salary/advances/', { params }).then(r => r.data);
export const createAdvance   = (data)   => api.post('employees/salary/advances/', data).then(r => r.data);
export const updateAdvance   = (id, data) => api.put(`employees/salary/advances/${id}/`, data).then(r => r.data);
export const deleteAdvance   = (id)     => api.delete(`employees/salary/advances/${id}/`).then(r => r.data);

// ── Salary Transactions ───────────────────────────────────────────────────────
export const listTransactions  = (params) => api.get('employees/salary/transactions/', { params }).then(r => r.data);
export const createTransaction = (data)   => api.post('employees/salary/transactions/', data).then(r => r.data);
export const updateTransaction = (id, data) => api.put(`employees/salary/transactions/${id}/`, data).then(r => r.data);
export const deleteTransaction = (id)     => api.delete(`employees/salary/transactions/${id}/`).then(r => r.data);

// ── Salary Compute (attendance-based) ────────────────────────────────────────
export const computeSalary = (params) => api.get('employees/salary/compute/', { params }).then(r => r.data);

// ── Employee Calendar (per-employee monthly view) ─────────────────────────────
export const getEmployeeCalendar = (id, params) => api.get(`employees/${id}/calendar/`, { params }).then(r => r.data);

// ── Kiosk ─────────────────────────────────────────────────────────────────────
export const kioskLookup    = (data) => api.post('employees/attendance/kiosk/lookup/', data).then(r => r.data);
export const kioskCheckIn   = (data) => api.post('employees/attendance/kiosk/', data).then(r => r.data);

// ── Auto Checkout ─────────────────────────────────────────────────────────────
export const autoCheckout   = ()     => api.post('employees/attendance/auto-checkout/').then(r => r.data);

// ── Incentive Settings & Compute ──────────────────────────────────────────────
export const getIncentiveSettings    = ()       => api.get('employees/salary/incentive/settings/').then(r => r.data);
export const updateIncentiveSettings = (data)   => api.put('employees/salary/incentive/settings/', data).then(r => r.data);
export const computeIncentive        = (params) => api.get('employees/salary/incentive/compute/', { params }).then(r => r.data);