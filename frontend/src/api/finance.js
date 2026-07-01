import api from './axios';

export const getDashboardStats = (params) =>
  api.get('finance/stats/', { params }).then(r => r.data);

export const getFinanceDashboard = (params) =>
  api.get('finance/dashboard/', { params }).then(r => r.data);

export const getFinanceIncome = (params) =>
  api.get('finance/income/', { params }).then(r => r.data);

export const getFinanceExpense = (params) =>
  api.get('finance/expense/', { params }).then(r => r.data);

export const getDailyReport = (date) =>
  api.get('finance/daily-report/', { params: date ? { date } : {} }).then(r => r.data);

export const createExpense = (data) => api.post('finance/expense/', data).then(r => r.data);
