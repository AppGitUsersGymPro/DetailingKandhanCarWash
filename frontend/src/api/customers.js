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
export const patchAsset = (assetId, data) => api.patch(`customers/assets/${assetId}/`, data).then(r => r.data);
export const deleteAsset = (assetId) => api.delete(`customers/assets/${assetId}/`).then(r => r.data);
export const getAssetByVehicleNumber = (vehicleNumber) => api.get(`customers/assets/vehicle/${vehicleNumber}/`).then(r => r.data);
export const checkVehicle = (vehicleNumber) => api.get('customers/check-vehicle/', { params: { vehicle_number: vehicleNumber } }).then(r => r.data);
export const checkCustomer = (phoneNumber) => api.get('customers/check-customer/', { params: { phone_number: phoneNumber } }).then(r => r.data);

// All vehicles list (across all customers)
export const listAllVehicles = (params) => api.get('customers/vehicles/', { params }).then(r => r.data);

// Vehicle lookup tables
export const listVehicleCompanies = (params) => api.get('customers/vehicle-companies/', { params }).then(r => r.data);
export const createVehicleCompany = (data) => api.post('customers/vehicle-companies/', data).then(r => r.data);
export const listVehicleModels = (params) => api.get('customers/vehicle-models/', { params }).then(r => r.data);
export const createVehicleModel = (data) => api.post('customers/vehicle-models/', data).then(r => r.data);
export const listVehicleColours = (params) => api.get('customers/vehicle-colours/', { params }).then(r => r.data);
export const createVehicleColour = (data) => api.post('customers/vehicle-colours/', data).then(r => r.data);

// Garage owners
export const listGarageOwners  = (params) => api.get('customers/garages/', { params }).then(r => r.data);
export const createGarageOwner = (data)   => api.post('customers/garages/', data).then(r => r.data);
export const updateGarageOwner = (id, data) => api.put(`customers/garages/${id}/`, data).then(r => r.data);
export const deleteGarageOwner = (id)     => api.delete(`customers/garages/${id}/`).then(r => r.data);