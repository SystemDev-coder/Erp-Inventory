import { useState, useEffect } from 'react';
import { Employee, EmployeeInput } from '../../services/employee.service';
import { RoleRow } from '../../services/user.service';
import { Modal } from '../../components/ui/modal/Modal';

interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: EmployeeInput) => Promise<void>;
  employee?: Employee | null;
  roles: RoleRow[];
  isLoading?: boolean;
}

type EmployeeFormData = Omit<EmployeeInput, 'gender' | 'salary_type' | 'shift_type'> & {
  gender?: 'male' | 'female' | '';
  shift_type?: 'Morning' | 'Night' | 'Evening' | '';
};

export const EmployeeModal: React.FC<EmployeeModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  employee,
  roles,
  isLoading = false,
}) => {
  const [formData, setFormData] = useState<EmployeeFormData>({
    name: '',
    phone: '',
    address: '',
    role_id: undefined,
    salary: 0,
    shift_type: '',
    hire_date: new Date().toISOString().split('T')[0],
    gender: '',
  });

  useEffect(() => {
    if (employee) {
      setFormData({
        name: employee.full_name,
        phone: employee.phone || '',
        address: employee.address || '',
        role_id: employee.role_id ?? undefined,
        salary: Number(employee.basic_salary) || 0,
        shift_type: (employee.shift_type as 'Morning' | 'Night' | 'Evening') || 'Morning',
        hire_date: employee.hire_date.split('T')[0],
        gender: (employee.gender as 'male' | 'female') || '',
      });
    } else {
      setFormData({
        name: '',
        phone: '',
        address: '',
        role_id: undefined,
        salary: 0,
        shift_type: '',
        hire_date: new Date().toISOString().split('T')[0],
        gender: '',
      });
    }
  }, [employee, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!formData.role_id) return;
    const selectedRole = roles.find((role) => Number(role.role_id) === Number(formData.role_id));
    if (!selectedRole) return;
    const roleSalary = Number(selectedRole.monthly_salary || 0);
    setFormData((prev) => ({
      ...prev,
      salary: roleSalary,
    }));
  }, [formData.role_id, isOpen, roles]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Ensure salary and role_id are numbers (HTML inputs can send strings)
    const payload: EmployeeInput = {
      ...formData,
      salary: Number(formData.salary) || 0,
      role_id: formData.role_id != null ? Number(formData.role_id) : undefined,
      gender: formData.gender || undefined,
      salary_type: 'Monthly',
      shift_type: formData.shift_type || undefined,
    };
    await onSubmit(payload);
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={employee ? 'Edit Employee' : 'Add New Employee'}
      size="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label>
            <span>Employee Name *</span>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter employee name"
            />
          </label>

          <label>
            <span>Phone Number</span>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="Enter phone number"
            />
          </label>

          <label>
            <span>Gender *</span>
            <select
              required
              value={formData.gender || ''}
              onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'male' | 'female' })}
            >
              <option value="" disabled>Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>

          <label>
            <span>Address</span>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Enter employee address"
            />
          </label>

          <label>
            <span>Job Role</span>
            <select
              value={formData.role_id || ''}
              onChange={(e) => setFormData({ ...formData, role_id: e.target.value ? Number(e.target.value) : undefined })}
            >
              <option value="" disabled>Select role</option>
              {roles.map((role) => (
                <option key={role.role_id} value={role.role_id}>
                  {role.role_name}
                </option>
              ))}
            </select>
            <p className="text-xs font-normal text-slate-500 dark:text-slate-300">
              Used for user account generation
            </p>
          </label>

          <label>
            <span>Salary Type</span>
            <input type="text" value="Monthly" readOnly />
          </label>

          <label>
            <span>Shift Type *</span>
            <select
              required
              value={formData.shift_type || ''}
              onChange={(e) => setFormData({ ...formData, shift_type: e.target.value as 'Morning' | 'Night' | 'Evening' })}
            >
              <option value="" disabled>Select shift type</option>
              <option value="Morning">Morning</option>
              <option value="Night">Night</option>
              <option value="Evening">Evening</option>
            </select>
          </label>

          <label>
            <span>Monthly Salary *</span>
            <input
              type="number"
              required
              min={0}
              step="0.01"
              value={formData.salary}
              onChange={(e) => setFormData({ ...formData, salary: Number(e.target.value || 0) })}
              placeholder="0.00"
            />
            <p className="text-xs font-normal text-slate-500 dark:text-slate-300">
              Auto-filled from role, you can adjust before save
            </p>
          </label>

          <label className="md:col-span-2">
            <span>Hire Date *</span>
            <input
              type="date"
              required
              value={formData.hire_date}
              onChange={(e) => setFormData({ ...formData, hire_date: e.target.value })}
            />
          </label>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="px-5 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {isLoading ? 'Saving...' : employee ? 'Update Employee' : 'Create Employee'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
