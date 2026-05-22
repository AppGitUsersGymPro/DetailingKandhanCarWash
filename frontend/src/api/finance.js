import api from './axios';

export const getFinanceDashboard = (month) =>
  api.get('finance/dashboard/', { params: month ? { month } : {} }).then(r => r.data);

export const getFinanceIncome = (params) =>
  api.get('finance/income/', { params }).then(r => r.data);

export const getFinanceExpense = (params) =>
  api.get('finance/expense/', { params }).then(r => r.data);
