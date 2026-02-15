import { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/modal/Modal';
import { Shield, User, Key, Eye, EyeOff, UserPlus } from 'lucide-react';
import { employeeService, Employee } from '../../services/employee.service';
import { RoleRow } from '../../services/user.service';
import { useToast } from '../../components/ui/toast/Toast';

interface GenerateUserFormData {
  emp_id: number | '';
  username: string;
  email: string;
  password: string;
  role_id: number | '';
  is_active: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (form: GenerateUserFormData) => Promise<void>;
  roles: RoleRow[];
}

const GenerateUserFromEmployeeModal = ({ isOpen, onClose, onGenerate, roles }: Props) => {
  const { showToast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [form, setForm] = useState<GenerateUserFormData>({
    emp_id: '',
    username: '',
    email: '',
    password: '',
    role_id: '',
    is_active: true,
  });

  // Fetch employees without user accounts
  useEffect(() => {
    if (isOpen) {
      fetchEmployeesWithoutUsers();
      // Reset form
      setForm({
        emp_id: '',
        username: '',
        email: '',
        password: generateRandomPassword(),
        role_id: '',
        is_active: true,
      });
      setShowPassword(false);
    }
  }, [isOpen]);

  const fetchEmployeesWithoutUsers = async () => {
    setLoadingEmployees(true);
    try {
      const response = await employeeService.list({ status: 'active' });
      if (response.success && response.data?.employees) {
        // Filter only employees without user accounts
        const employeesWithoutUsers = response.data.employees.filter(
          (emp) => !emp.user_id
        );
        setEmployees(employeesWithoutUsers);
        
        if (employeesWithoutUsers.length === 0) {
          showToast('info', 'No Employees Available', 'All active employees already have user accounts');
        }
      }
    } catch (error) {
      showToast('error', 'Error', 'Failed to load employees');
    } finally {
      setLoadingEmployees(false);
    }
  };

  const generateRandomPassword = () => {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  };

  const handleEmployeeChange = (empId: string) => {
    const employeeId = empId ? Number(empId) : '';
    setForm({ ...form, emp_id: employeeId });

    if (employeeId) {
      const selectedEmployee = employees.find((e) => e.emp_id === employeeId);
      if (selectedEmployee) {
        // Auto-fill username and email from employee data
        const username = selectedEmployee.full_name
          .toLowerCase()
          .replace(/\s+/g, '.')
          .replace(/[^a-z0-9.]/g, '');
        
        const email = `${username}@company.com`;

        setForm((prev) => ({
          ...prev,
          emp_id: employeeId,
          username,
          email,
        }));
      }
    }
  };

  const handleGeneratePassword = () => {
    setForm({ ...form, password: generateRandomPassword() });
    setShowPassword(true);
    showToast('success', 'Password Generated', 'New secure password created');
  };

  const handleSubmit = async () => {
    // Validation
    if (!form.emp_id) {
      showToast('error', 'Validation Error', 'Please select an employee');
      return;
    }
    if (!form.username.trim()) {
      showToast('error', 'Validation Error', 'Username is required');
      return;
    }
    if (!form.password.trim()) {
      showToast('error', 'Validation Error', 'Password is required');
      return;
    }
    if (!form.role_id) {
      showToast('error', 'Validation Error', 'Please select a role');
      return;
    }

    setGenerating(true);
    try {
      await onGenerate(form);
      onClose();
    } catch (error) {
      // Error handling is done in parent component
    } finally {
      setGenerating(false);
    }
  };

  const selectedEmployee = employees.find((e) => e.emp_id === form.emp_id);

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={
        <div className="flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-primary-600" />
          <span>Generate User Account from Employee</span>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Info Banner */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-200">
          <p className="font-medium mb-1">Create User from Employee</p>
          <p className="text-xs">Select an active employee without an existing user account to generate system access credentials.</p>
        </div>

        {/* Employee Selection */}
        <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4" />
            Select Employee *
          </div>
          <select
            className="rounded-lg border px-3 py-2.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            value={form.emp_id}
            onChange={(e) => handleEmployeeChange(e.target.value)}
            disabled={loadingEmployees}
          >
            <option value="">
              {loadingEmployees ? 'Loading employees...' : 'Choose an employee'}
            </option>
            {employees.map((emp) => (
              <option key={emp.emp_id} value={emp.emp_id}>
                {emp.full_name} - {emp.phone || 'No phone'} - Hired: {new Date(emp.hire_date).toLocaleDateString()}
              </option>
            ))}
          </select>
          {employees.length === 0 && !loadingEmployees && (
            <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
              No employees available. All active employees already have user accounts.
            </p>
          )}
        </label>

        {/* Selected Employee Info */}
        {selectedEmployee && (
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Employee Details:</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Name:</span>
                <span className="ml-2 font-medium text-slate-900 dark:text-white">{selectedEmployee.full_name}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Phone:</span>
                <span className="ml-2 font-medium text-slate-900 dark:text-white">{selectedEmployee.phone || '-'}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Salary:</span>
                <span className="ml-2 font-medium text-green-600 dark:text-green-400">
                  ${Number(selectedEmployee.basic_salary || 0).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Status:</span>
                <span className="ml-2 font-medium text-slate-900 dark:text-white capitalize">{selectedEmployee.status}</span>
              </div>
            </div>
          </div>
        )}

        {/* Username */}
        <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4" />
            Username *
          </div>
          <input
            type="text"
            className="rounded-lg border px-3 py-2.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="e.g., john.doe"
          />
        </label>

        {/* Email */}
        <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
          Email (optional)
          <input
            type="email"
            className="rounded-lg border px-3 py-2.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="employee@company.com"
          />
        </label>

        {/* Role */}
        <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Role *
          </div>
          <select
            className="rounded-lg border px-3 py-2.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            value={form.role_id}
            onChange={(e) => setForm({ ...form, role_id: e.target.value ? Number(e.target.value) : '' })}
          >
            <option value="">Select role</option>
            {roles.map((r) => (
              <option key={r.role_id} value={r.role_id}>{r.role_name}</option>
            ))}
          </select>
        </label>

        {/* Password */}
        <div className="space-y-2">
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4" />
                Password *
              </div>
              <button
                type="button"
                onClick={handleGeneratePassword}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium"
              >
                Generate Strong Password
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="w-full rounded-lg border px-3 py-2.5 pr-10 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Enter secure password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </label>
          {form.password && (
            <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded p-2">
              <span className="font-medium">Tip:</span> Save this password securely. The employee will need it to login.
            </div>
          )}
        </div>

        {/* Active Status */}
        <label className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
          />
          User account active
        </label>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            disabled={generating}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={generating || !form.emp_id}
            className="px-5 py-2 rounded-lg bg-gradient-to-r from-primary-600 to-primary-700 text-white hover:from-primary-700 hover:to-primary-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center gap-2"
          >
            {generating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                Generate User Account
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default GenerateUserFromEmployeeModal;
