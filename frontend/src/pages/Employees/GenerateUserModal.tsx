import { useState, useEffect } from 'react';
import { X, UserPlus, Mail, Lock, Shield, User, Briefcase, CheckCircle, AlertCircle } from 'lucide-react';
import { Employee } from '../../services/employee.service';
import Badge from '../../components/ui/badge/Badge';

interface GenerateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: UserGenerationData) => Promise<void>;
  employee: Employee | null;
  isLoading?: boolean;
}

export interface UserGenerationData {
  employeeId: number;
  username: string;
  email: string;
  password: string;
  role: string;
}

export const GenerateUserModal: React.FC<GenerateUserModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  employee,
  isLoading = false,
}) => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    role: '',
  });

  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (employee && isOpen) {
      // Generate default values from employee
      const defaultUsername = employee.name.toLowerCase().replace(/\s+/g, '.');
      const defaultEmail = `${employee.name.toLowerCase().replace(/\s+/g, '.')}@company.com`;
      const defaultRole = employee.job_title || 'employee';
      
      // Generate new user defaults
      setFormData({
        username: defaultUsername,
        email: defaultEmail,
        password: generateRandomPassword(),
        role: defaultRole,
      });
    }
  }, [employee, isOpen]);

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  const handleGeneratePassword = () => {
    setFormData({ ...formData, password: generateRandomPassword() });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;

    const userData: UserGenerationData = {
      employeeId: employee.emp_id,
      username: formData.username,
      email: formData.email,
      password: formData.password,
      role: formData.role,
    };

    await onSubmit(userData);
  };

  if (!isOpen || !employee) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <UserPlus className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Generate User Account</h2>
              <p className="text-green-100 text-sm">Create system login for employee</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Employee Info Banner */}
        <div className="p-6 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                <User className="w-8 h-8 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{employee.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Briefcase className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-600 dark:text-slate-400">{employee.job_title || 'Employee'}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Shield className="w-4 h-4 text-slate-500" />
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    Will be assigned role: <strong className="text-primary-600 dark:text-primary-400">{formData.role}</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              <User className="w-4 h-4 inline mr-2" />
              Username *
            </label>
            <input
              type="text"
              required
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
              placeholder="e.g., john.doe"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Used for logging into the system
            </p>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              <Mail className="w-4 h-4 inline mr-2" />
              Email *
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
              placeholder="e.g., john.doe@company.com"
            />
          </div>

          {/* Role (from Job Title) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              <Shield className="w-4 h-4 inline mr-2" />
              System Role *
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                placeholder="e.g., manager, cashier, accountant"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Based on employee's job title. Determines system permissions.
            </p>
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              <Lock className="w-4 h-4 inline mr-2" />
              Password *
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-3 pr-24 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all font-mono"
                placeholder="Auto-generated secure password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Secure password for system access
              </p>
              <button
                type="button"
                onClick={handleGeneratePassword}
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
              >
                🔄 Generate New
              </button>
            </div>
          </div>

          {/* Info Box */}
          <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-200 dark:border-amber-800">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-amber-900 dark:text-amber-400">Important</div>
              <div className="text-sm text-amber-700 dark:text-amber-300">
                Make sure to save the password! The employee will need these credentials to log in to the system.
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <h4 className="font-semibold text-slate-900 dark:text-white mb-3">User Account Summary</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Employee:</span>
                <span className="font-medium text-slate-900 dark:text-white">{employee.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Username:</span>
                <span className="font-medium text-slate-900 dark:text-white">{formData.username || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Email:</span>
                <span className="font-medium text-slate-900 dark:text-white">{formData.email || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Role:</span>
                <span className="font-medium text-primary-600 dark:text-primary-400">{formData.role || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Password Set:</span>
                <span className="font-medium text-green-600 dark:text-green-400">
                  {formData.password ? '✓ Yes' : '✗ No'}
                </span>
              </div>
            </div>
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
              className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 shadow-green-500/20 text-white rounded-xl transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg active:scale-95"
            >
              {isLoading ? (
                'Generating...'
              ) : (
                <>
                  <UserPlus className="w-5 h-5 inline mr-2" />
                  Generate User Account
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
