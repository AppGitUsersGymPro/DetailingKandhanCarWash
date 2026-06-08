import api from './axios';

const ACCESS_KEY       = 'crm_access_token';
const REFRESH_KEY      = 'crm_refresh_token';
const USER_KEY         = 'crm_username';
const ROLE_KEY         = 'crm_role';
const EMPLOYEE_NAME_KEY = 'crm_employee_name';
const EMPLOYEE_ID_KEY   = 'crm_employee_id';

export const tokens = {
  getAccess:       () => localStorage.getItem(ACCESS_KEY),
  getRefresh:      () => localStorage.getItem(REFRESH_KEY),
  getUser:         () => localStorage.getItem(USER_KEY),
  getRole:         () => localStorage.getItem(ROLE_KEY) || 'admin',
  getEmployeeName: () => localStorage.getItem(EMPLOYEE_NAME_KEY) || null,
  getEmployeeId:   () => localStorage.getItem(EMPLOYEE_ID_KEY)   || null,

  set: (access, refresh, username, role, employeeName, employeeId) => {
    if (access)   localStorage.setItem(ACCESS_KEY,  access);
    if (refresh)  localStorage.setItem(REFRESH_KEY, refresh);
    if (username) localStorage.setItem(USER_KEY,    username);
    if (role)     localStorage.setItem(ROLE_KEY,    role);
    // Store or clear employee info
    if (employeeName) localStorage.setItem(EMPLOYEE_NAME_KEY, employeeName);
    else              localStorage.removeItem(EMPLOYEE_NAME_KEY);
    if (employeeId)   localStorage.setItem(EMPLOYEE_ID_KEY, String(employeeId));
    else              localStorage.removeItem(EMPLOYEE_ID_KEY);
  },

  setAccess: (access) => localStorage.setItem(ACCESS_KEY, access),

  clear: () => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(EMPLOYEE_NAME_KEY);
    localStorage.removeItem(EMPLOYEE_ID_KEY);
  },
};

export const login = async (username, password) => {
  const { data } = await api.post('token/', { username, password });
  tokens.set(
    data.access,
    data.refresh,
    username,
    data.role || 'admin',
    data.employee_name || null,
    data.employee_id   || null,
  );
  return data;
};

export const refreshAccess = async () => {
  const refresh = tokens.getRefresh();
  if (!refresh) throw new Error('No refresh token');
  const { data } = await api.post('token/refresh/', { refresh });
  tokens.setAccess(data.access);
  return data.access;
};

export const logout = () => {
  tokens.clear();
};
