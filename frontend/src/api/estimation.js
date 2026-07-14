import api from './axios';

export const listEstimations = (params) => api.get('estimation/', { params }).then(r => r.data);
export const createEstimation = (data) => api.post('estimation/', data).then(r => r.data);
export const getEstimation = (id) => api.get(`estimation/${id}/`).then(r => r.data);
export const deleteEstimation = (id) => api.delete(`estimation/${id}/`).then(r => r.data);
