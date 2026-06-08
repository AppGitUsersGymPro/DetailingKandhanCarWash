import api from './axios';

export const listNotifications = (params) =>
  api.get('notifications/', { params }).then(r => r.data);
