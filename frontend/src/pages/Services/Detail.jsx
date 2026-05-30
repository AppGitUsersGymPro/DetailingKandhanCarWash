import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, Plus, Package, UserCog, Trash2, IndianRupee } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { Field, Input, Select } from '../../components/Field';
import { useToast } from '../../components/Toast';
import {
  getService,
  addServiceProduct,
  removeServiceProduct,
  addServiceEmployee,
  removeServiceEmployee,
} from '../../api/services';
import { listProducts } from '../../api/products';
import { listEmployees } from '../../api/employees';
import { extractError } from '../../api/axios';

export default function ServiceDetail() {
  const { id } = useParams();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [service, setService] = useState(null);
  const [products, setProducts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [productModal, setProductModal] = useState(false);
  const [employeeModal, setEmployeeModal] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null); // { type, id }

  const load = async () => {
    setLoading(true);
    try {
      const [s, p, e] = await Promise.all([getService(id), listProducts(), listEmployees()]);
      setService(s);
      setProducts(Array.isArray(p) ? p : (p.results || []));
      setEmployees(Array.isArray(e) ? e : (e.results || []));
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const onConfirmRemove = async () => {
    if (!confirmRemove) return;
    try {
      if (confirmRemove.type === 'product') await removeServiceProduct(confirmRemove.id);
      else await removeServiceEmployee(confirmRemove.id);
      toast.success('Removed');
      setConfirmRemove(null);
      load();
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  if (loading) return <Loading />;
  if (!service) return <div className="text-gray-400">Service not found</div>;

  return (
    <div>
      <PageHeader
        title={service.service_name}
        subtitle={`Code: ${service.service_code}`}
        breadcrumbs={
          <Link to="/services" className="hover:text-gray-300 inline-flex items-center gap-1">
            <ChevronLeft size={12} /> Back to Services
          </Link>
        }
        actions={
          <div className="flex items-center gap-2 bg-bg-card border border-border rounded-md px-3 py-1.5">
            <span className="text-xs text-gray-400">Price</span>
            <span className="text-base font-semibold text-gray-100 inline-flex items-center">
              <IndianRupee size={14} />{Number(service.service_price).toLocaleString('en-IN')}
            </span>
          </div>
        }
      />

      {service.service_description && (
        <div className="bg-bg-card border border-border rounded-xl p-5 mb-6 text-sm text-gray-300">
          {service.service_description}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-bg-card border border-border rounded-xl">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-100 flex items-center gap-2">
              <Package size={16} /> Products Used
            </h2>
            <Button size="sm" onClick={() => setProductModal(true)}>
              <Plus size={14} /> Add Product
            </Button>
          </div>
          {(service.products || []).length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-500">No products linked</div>
          ) : (
            <div className="divide-y divide-border">
              {service.products.map((p) => (
                <div key={p.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-100">{p.product_name}</div>
                    <div className="text-xs text-gray-400">{p.unit}</div>
                  </div>
                  <button
                    onClick={() => setConfirmRemove({ type: 'product', id: p.id })}
                    className="p-1.5 text-gray-400 hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-bg-card border border-border rounded-xl">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-100 flex items-center gap-2">
              <UserCog size={16} /> Assigned Employees
            </h2>
            <Button size="sm" onClick={() => setEmployeeModal(true)}>
              <Plus size={14} /> Assign Employee
            </Button>
          </div>
          {(service.employees || []).length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-500">No employees assigned</div>
          ) : (
            <div className="divide-y divide-border">
              {service.employees.map((emp) => (
                <div key={emp.id} className="px-5 py-3 flex items-center justify-between">
                  <div className="font-medium text-gray-100">{emp.employee_name}</div>
                  <button
                    onClick={() => setConfirmRemove({ type: 'employee', id: emp.id })}
                    className="p-1.5 text-gray-400 hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AddProductModal
        open={productModal}
        onClose={() => setProductModal(false)}
        onSaved={load}
        serviceId={id}
        products={products}
        existingIds={(service.products || []).map((p) => p.product)}
      />

      <AddEmployeeModal
        open={employeeModal}
        onClose={() => setEmployeeModal(false)}
        onSaved={load}
        serviceId={id}
        employees={employees}
        existingIds={(service.employees || []).map((e) => e.employee)}
      />

      <ConfirmDialog
        open={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        onConfirm={onConfirmRemove}
        title="Remove this link?"
        message="This will not delete the underlying record."
        confirmText="Remove"
      />
    </div>
  );
}

function AddProductModal({ open, onClose, onSaved, serviceId, products, existingIds }) {
  const toast = useToast();
  const [productId, setProductId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (open) setProductId(''); }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!productId) return;
    setSubmitting(true);
    try {
      await addServiceProduct(serviceId, { product: Number(productId) });
      toast.success('Product added');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const available = products.filter((p) => !existingIds.includes(p.id));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Product to Service"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={submitting} disabled={!productId}>Add</Button>
        </>
      }
    >
      <Field label="Product" required>
        <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Select product...</option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>{p.product_name} ({p.product_unit})</option>
          ))}
        </Select>
      </Field>
    </Modal>
  );
}

function AddEmployeeModal({ open, onClose, onSaved, serviceId, employees, existingIds }) {
  const toast = useToast();
  const [empId, setEmpId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (open) setEmpId(''); }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!empId) return;
    setSubmitting(true);
    try {
      await addServiceEmployee(serviceId, { employee: Number(empId) });
      toast.success('Employee assigned');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const available = employees.filter((e) => !existingIds.includes(e.id));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign Employee to Service"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={submitting} disabled={!empId}>Assign</Button>
        </>
      }
    >
      <Field label="Employee" required>
        <Select value={empId} onChange={(e) => setEmpId(e.target.value)}>
          <option value="">Select employee...</option>
          {available.map((emp) => (
            <option key={emp.id} value={emp.id}>{emp.employee_name}</option>
          ))}
        </Select>
      </Field>
    </Modal>
  );
}
