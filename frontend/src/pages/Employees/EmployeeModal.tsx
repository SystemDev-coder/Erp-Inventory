import { useState, useEffect } from 'react';
import { X, User, Phone, DollarSign, Briefcase, Calendar, Shield } from 'lucide-react';
import { Employee, EmployeeInput } from '../../services/employee.service';
import { RoleRow } from '../../services/user.service';

interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: EmployeeInput) => Promise<void>;
  employee?: Employee | null;
  roles: RoleRow[];
  isLoading?: boolean;
}

export const EmployeeModal: React.FC<EmployeeModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  employee,
  roles,
  isLoading = false,
}) => {
  const [formData, setFormData] = useState<EmployeeInput>({
    name: '',
    phone: '',
    address: '',
    role_id: undefined,
    salary: 0,
    hire_date: new Date().toISOString().split('T')[0],
    status: 'active',
  });

  useEffect(() => {
    if (employee) {
      setFormData({
        name: employee.full_name,
        phone: employee.phone || '',
        address: employee.address || '',
        role_id: employee.role_id ?? undefined,
        salary: Number(employee.basic_salary) || 0,
        hire_date: employee.hire_date.split('T')[0],
        status: employee.status,
      });
    } else {
      setFormData({
        name: '',
        phone: '',
        address: '',
        role_id: undefined,
        salary: 0,
        hire_date: new Date().toISOString().split('T')[0],
        status: 'active',
      });
    }
  }, [employee, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Ensure salary and role_id are numbers (HTML inputs can send strings)
    const payload = {
      ...formData,
      salary: Number(formData.salary) || 0,
      role_id: formData.role_id != null ? Number(formData.role_id) : undefined,
    };
    await onSubmit(payload);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {employee ? 'Edit Employee' : 'Add New Employee'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Employee Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              <User className="w-4 h-4 inline mr-2" />
              Employee Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
              placeholder="Enter employee name"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              <Phone className="w-4 h-4 inline mr-2" />
              Phone Number
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
              placeholder="Enter phone number"
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              <Briefcase className="w-4 h-4 inline mr-2" />
              Address
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
              placeholder="Enter employee address"
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              <Shield className="w-4 h-4 inline mr-2" />
              Job Role
            </label>
            <select
              value={formData.role_id || ''}
              onChange={(e) => setFormData({ ...formData, role_id: e.target.value ? Number(e.target.value) : undefined })}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            >
              <option value="">Select role</option>
              {roles.map((role) => (
                <option key={role.role_id} value={role.role_id}>
                  {role.role_name}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Required for user account generation
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Salary */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <DollarSign className="w-4 h-4 inline mr-2" />
                Monthly Salary *
              </label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={formData.salary}
                onChange={(e) => setFormData({ ...formData, salary: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                placeholder="0.00"
              />
            </div>

            {/* Hire Date */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <Calendar className="w-4 h-4 inline mr-2" />
                Hire Date *
              </label>
              <input
                type="date"
                required
                value={formData.hire_date}
                onChange={(e) => setFormData({ ...formData, hire_date: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Status
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="terminated">Terminated</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-6 py-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary-500/20"
            >
              {isLoading ? 'Saving...' : employee ? 'Update Employee' : 'Create Employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
