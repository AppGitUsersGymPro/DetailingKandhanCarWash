import api from './axios';

export const listJobCards = (params) => api.get('jobcards/', { params }).then(r => r.data);
export const createJobCard = (data) => api.post('jobcards/', data).then(r => r.data);
export const createFullJobCard = (data) => api.post('jobcards/create-full/', data).then(r => r.data);
export const getJobCard = (id) => api.get(`jobcards/${id}/`).then(r => r.data);
export const updateJobCard = (id, data) => api.put(`jobcards/${id}/`, data).then(r => r.data);
export const deleteJobCard = (id) => api.delete(`jobcards/${id}/`).then(r => r.data);
export const listJobCardsByType = (vehicleType) => api.get(`jobcards/by-vehicle/${vehicleType}/`).then(r => r.data);
export const listJobCardServices = (id) => api.get(`jobcards/${id}/services/`).then(r => r.data);
export const addJobCardService = (id, data) => api.post(`jobcards/${id}/services/`, data).then(r => r.data);
export const removeJobCardService = (serviceLinkId) => api.delete(`jobcards/services/${serviceLinkId}/`).then(r => r.data);

export const listJobCardServiceEmployees = (serviceLinkId) => api.get(`jobcards/services/${serviceLinkId}/employees/`).then(r => r.data);
export const addJobCardServiceEmployee = (serviceLinkId, data) => api.post(`jobcards/services/${serviceLinkId}/employees/`, data).then(r => r.data);
export const removeJobCardServiceEmployee = (empLinkId) => api.delete(`jobcards/services/employees/${empLinkId}/`).then(r => r.data);

export const listJobCardPayments = (id) => api.get(`jobcards/${id}/payments/`).then(r => r.data);
export const addJobCardPayment = (id, data) => api.post(`jobcards/${id}/payments/`, data).then(r => r.data);
export const removeJobCardPayment = (paymentId) => api.delete(`jobcards/payments/${paymentId}/`).then(r => r.data);
