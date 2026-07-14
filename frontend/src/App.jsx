import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import { ToastProvider } from './components/Toast';
import { tokens } from './api/auth';

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
import Estimation from './pages/Estimation';
import EstimationCreate from './pages/Estimation/estimation';
import EstimationDetail from './pages/Estimation/Detail';
import Settings from './pages/Settings';
import Notifications from './pages/Notifications';
import UserGuide from './pages/UserGuide';
import PublicInvoiceView from './pages/Public/InvoiceView';
import PublicSalesInvoiceView from './pages/Public/SalesInvoiceView';

function AdminOnly({ children }) {
  const role = tokens.getRole();
  if (role === 'staff') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/invoice/view/:token" element={<PublicInvoiceView />} />
          <Route path="/sales/view/:token" element={<PublicSalesInvoiceView />} />
          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<Dashboard />} />

            {/* Job Cards — staff allowed */}
            <Route path="jobcards" element={<JobCardsList />} />
            <Route path="jobcards/new" element={<JobCardCreate />} />
            <Route path="jobcards/by-vehicle/:vehicleType" element={<JobCardsByVehicle />} />
            <Route path="jobcards/by-status/:statusType" element={<JobCardsByStatus />} />
            <Route path="jobcards/garage/:garageId" element={<GarageDetail />} />
            <Route path="jobcards/:id/edit" element={<JobCardEdit />} />
            <Route path="jobcards/:id" element={<JobCardDetail />} />

            {/* Customers — staff allowed */}
            <Route path="customers" element={<Customers />} />
            <Route path="customers/vehicles/:vehicleId" element={<VehicleDetail />} />
            <Route path="customers/:id" element={<CustomerDetail />} />

            {/* Sales — staff allowed */}
            <Route path="sales" element={<Sales />} />

            {/* Kiosk — staff allowed */}
            <Route path="kiosk" element={<Kiosk />} />

            {/* Estimation — admin only */}
            <Route path="estimation" element={<AdminOnly><Estimation /></AdminOnly>} />
            <Route path="estimation/new" element={<AdminOnly><EstimationCreate /></AdminOnly>} />
            <Route path="estimation/:id" element={<AdminOnly><EstimationDetail /></AdminOnly>} />

            {/* Admin-only routes */}
            <Route path="services" element={<AdminOnly><Services /></AdminOnly>} />
            <Route path="services/:id" element={<AdminOnly><ServiceDetail /></AdminOnly>} />
            <Route path="employees/*" element={<AdminOnly><Employees /></AdminOnly>} />
            <Route path="vendors/*" element={<AdminOnly><Vendors /></AdminOnly>} />
            <Route path="finance" element={<AdminOnly><Finance /></AdminOnly>} />
            <Route path="settings" element={<AdminOnly><Settings /></AdminOnly>} />

            <Route path="notifications" element={<Notifications />} />
            <Route path="guide" element={<UserGuide />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
