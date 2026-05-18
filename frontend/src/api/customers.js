import api from './axios';

export const listCustomers = (params) => api.get('customers/', { params }).then(r => r.data);
export const createCustomer = (data) => api.post('customers/', data).then(r => r.data);
export const getCustomer = (id) => api.get(`customers/${id}/`).then(r => r.data);
export const updateCustomer = (id, data) => api.put(`customers/${id}/`, data).then(r => r.data);
export const deleteCustomer = (id) => api.delete(`customers/${id}/`).then(r => r.data);

export const listCustomerAssets = (customerId) => api.get(`customers/${customerId}/assets/`).then(r => r.data);
export const addCustomerAsset = (customerId, data) => api.post(`customers/${customerId}/assets/`, data).then(r => r.data);
export const getAsset = (assetId) => api.get(`customers/assets/${assetId}/`).then(r => r.data);
export const updateAsset = (assetId, data) => api.put(`customers/assets/${assetId}/`, data).then(r => r.data);
export const deleteAsset = (assetId) => api.delete(`customers/assets/${assetId}/`).then(r => r.data);
export const getAssetByVehicleNumber = (vehicleNumber) => api.get(`customers/assets/vehicle/${vehicleNumber}/`).then(r => r.data);
export const checkVehicle = (vehicleNumber) => api.get('customers/check-vehicle/', { params: { vehicle_number: vehicleNumber } }).then(r => r.data);
export const checkCustomer = (phoneNumber) => api.get('customers/check-customer/', { params: { phone_number: phoneNumber } }).then(r => r.data);