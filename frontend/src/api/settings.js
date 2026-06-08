import api from './axios';

export const getSettings      = ()     => api.get('settings/').then(r => r.data);
export const updateSettings   = (data) => api.patch('settings/', data).then(r => r.data);
export const changePassword   = (data) => api.post('settings/change-password/', data).then(r => r.data);

export const listStaffUsers        = ()         => api.get('settings/staff-users/').then(r => r.data);
export const createStaffUser       = (data)     => api.post('settings/staff-users/', data).then(r => r.data);
export const deleteStaffUser       = (id)       => api.delete(`settings/staff-users/${id}/`).then(r => r.data);
export const resetStaffPassword    = (id, data) => api.patch(`settings/staff-users/${id}/`, data).then(r => r.data);
export const listAvailableEmployees = ()        => api.get('settings/available-employees/').then(r => r.data);
