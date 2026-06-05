import api from './axios';

export const getSalesAnalytics  = ()       => api.get('jobcards/sales-analytics/').then(r => r.data);
export const listSalesOrders    = (params) => api.get('jobcards/sales-orders/', { params }).then(r => r.data);
export const createSalesOrder   = (data)   => api.post('jobcards/sales-orders/', data).then(r => r.data);
export const deleteSalesOrder   = (id)     => api.delete(`jobcards/sales-orders/${id}/`).then(r => r.data);

export const lookupCustomer = (phone) =>
  api.get('customers/check-customer/', { params: { phone_number: phone } }).then(r => r.data);
