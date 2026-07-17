import axios from 'axios';
import api from './axios';

// Unauthenticated instance — the public share link must work for customers who
// have no token (and must not trigger the 401 → /login redirect).
const publicHttp = axios.create({ baseURL: import.meta.env.VITE_API_URL });

export const listEstimations = (params) => api.get('estimation/', { params }).then(r => r.data);
export const createEstimation = (data) => api.post('estimation/', data).then(r => r.data);
export const getEstimation = (id) => api.get(`estimation/${id}/`).then(r => r.data);
export const deleteEstimation = (id) => api.delete(`estimation/${id}/`).then(r => r.data);

export const getPublicEstimation = (token) =>
  publicHttp.get(`estimation/public/${token}/`).then(r => r.data);
