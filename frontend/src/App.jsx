import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import { ToastProvider } from './components/Toast';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import JobCardsList from './pages/JobCards';
import JobCardCreate from './pages/JobCards/Create';
import JobCardDetail from './pages/JobCards/Detail';
import JobCardEdit from './pages/JobCards/Edit';
import JobCardsByVehicle from './pages/JobCards/ByVehicle';
import JobCardsByStatus from './pages/JobCards/ByStatus';
import GarageDetail from './pages/JobCards/GarageDetail';
import Customers from './pages/Customers';
import CustomerDetail from './pages/Customers/Detail';
import VehicleDetail from './pages/Customers/VehicleDetail';
import Services from './pages/Services';
import ServiceDetail from './pages/Services/Detail';
import Sales from './pages/Sales';
import Employees from './pages/Employees';
import Vendors from './pages/Vendors';
import Finance from './pages/Finance';
import Kiosk from './pages/Kiosk';
import Settings from './pages/Settings';
import Notifications from './pages/Notifications';

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="jobcards" element={<JobCardsList />} />
            <Route path="jobcards/new" element={<JobCardCreate />} />
            <Route path="jobcards/by-vehicle/:vehicleType" element={<JobCardsByVehicle />} />
            <Route path="jobcards/by-status/:statusType" element={<JobCardsByStatus />} />
            <Route path="jobcards/garage/:garageId" element={<GarageDetail />} />
            <Route path="jobcards/:id/edit" element={<JobCardEdit />} />
            <Route path="jobcards/:id" element={<JobCardDetail />} />
            <Route path="customers" element={<Customers />} />
            <Route path="customers/vehicles/:vehicleId" element={<VehicleDetail />} />
            <Route path="customers/:id" element={<CustomerDetail />} />
            <Route path="services" element={<Services />} />
            <Route path="services/:id" element={<ServiceDetail />} />
            <Route path="sales" element={<Sales />} />
            <Route path="employees/*" element={<Employees />} />
            <Route path="vendors/*" element={<Vendors />} />
            <Route path="finance" element={<Finance />} />
            <Route path="kiosk" element={<Kiosk />} />
            <Route path="settings" element={<Settings />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
