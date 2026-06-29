import axios from 'axios';
import api from './axios';

const publicHttp = axios.create({ baseURL: import.meta.env.VITE_API_URL });
export const getPublicJobCard = (token) => publicHttp.get(`jobcards/public/${token}/`).then(r => r.data);

export const listJobCards = (params) => api.get('jobcards/', { params }).then(r => r.data);
export const createJobCard = (data) => api.post('jobcards/', data).then(r => r.data);
export const createFullJobCard = (data) => api.post('jobcards/create-full/', data).then(r => r.data);
export const getJobCard = (id) => api.get(`jobcards/${id}/`).then(r => r.data);
export const updateJobCard = (id, data) => api.put(`jobcards/${id}/`, data).then(r => r.data);
export const deleteJobCard = (id) => api.delete(`jobcards/${id}/`).then(r => r.data);
export const listJobCardsByType = (vehicleType) => api.get(`jobcards/by-vehicle/${vehicleType}/`).then(r => r.data);
export const listJobCardsByTypeList = (vehicleType, params) => api.get(`jobcards/by-vehicle/${vehicleType}/list/`, { params }).then(r => r.data);
export const listJobCardServices = (id) => api.get(`jobcards/${id}/services/`).then(r => r.data);
export const addJobCardService = (id, data) => api.post(`jobcards/${id}/services/`, data).then(r => r.data);
export const removeJobCardService = (serviceLinkId) => api.delete(`jobcards/services/${serviceLinkId}/`).then(r => r.data);
export const updateJobCardService = (serviceLinkId, data) => api.patch(`jobcards/services/${serviceLinkId}/`, data).then(r => r.data);

export const listJobCardServiceEmployees = (serviceLinkId) => api.get(`jobcards/services/${serviceLinkId}/employees/`).then(r => r.data);
export const addJobCardServiceEmployee = (serviceLinkId, data) => api.post(`jobcards/services/${serviceLinkId}/employees/`, data).then(r => r.data);
export const removeJobCardServiceEmployee = (empLinkId) => api.delete(`jobcards/services/employees/${empLinkId}/`).then(r => r.data);

export const listJobCardPayments = (id) => api.get(`jobcards/${id}/payments/`).then(r => r.data);
export const addJobCardPayment = (id, data) => api.post(`jobcards/${id}/payments/`, data).then(r => r.data);
export const removeJobCardPayment = (paymentId) => api.delete(`jobcards/payments/${paymentId}/`).then(r => r.data);

export const loadProductsUsedForJobCard = (id) => api.get(`jobcards/${id}/products-used/`).then(r => r.data);

// JobCardProduct → inventory options + usage records
export const listInventoryOptions = (jcProductId) =>
  api.get(`jobcards/products/${jcProductId}/inventory-options/`).then(r => r.data);

export const listJobCardProductUsages = (jcProductId) =>
  api.get(`jobcards/products/${jcProductId}/usages/`).then(r => r.data);

export const addJobCardProductUsage = (jcProductId, data) =>
  api.post(`jobcards/products/${jcProductId}/usages/`, data).then(r => r.data);

export const removeJobCardProductUsage = (usageId) =>
  api.delete(`jobcards/usages/${usageId}/`).then(r => r.data);

export const getCustomerAnalytics = () => api.get('jobcards/customer-analytics/').then(r => r.data);
export const getCustomerTiers     = () => api.get('jobcards/customer-tiers/').then(r => r.data);
export const getCustomerReport    = (params) => api.get('jobcards/customer-report/', { params }).then(r => r.data);

// Sales Products
export const listSalesInventory        = (params) => api.get('jobcards/sales-inventory/', { params }).then(r => r.data);
export const addJobCardSalesProduct    = (jobCardId, data) => api.post(`jobcards/${jobCardId}/sales-products/`, data).then(r => r.data);
export const removeJobCardSalesProduct = (id) => api.delete(`jobcards/sales-products/${id}/`).then(r => r.data);

// Garage Groups
export const listGarageGroups    = (params)   => api.get('jobcards/garage-groups/', { params }).then(r => r.data);
export const getGarageGroup      = (garageId) => api.get('jobcards/garage-groups/', { params: { garage_id: garageId } }).then(r => r.data[0] || null);
export const createGaragePayment = (data)     => api.post('jobcards/garage-payments/', data).then(r => r.data);
