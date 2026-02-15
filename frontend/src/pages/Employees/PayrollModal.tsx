import { useState, useEffect } from 'react';
import { X, Wallet, Users, User, Calendar, DollarSign, CheckCircle, AlertCircle } from 'lucide-react';
import { Employee } from '../../services/employee.service';
import Badge from '../../components/ui/badge/Badge';

interface PayrollModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: PayrollData) => Promise<void>;
  employees: Employee[];
  isLoading?: boolean;
}

export interface PayrollData {
  payrollType: 'all' | 'specific';
  employeeId?: number;
  month: string; // Format: YYYY-MM
  year: number;
  monthName: string;
  includeInactive?: boolean;
}

export const PayrollModal: React.FC<PayrollModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  employees,
  isLoading = false,
}) => {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  
  const [formData, setFormData] = useState<{
    payrollType: 'all' | 'specific';
    employeeId: number | '';
    month: number;
    year: number;
    includeInactive: boolean;
  }>({
    payrollType: 'all',
    employeeId: '',
    month: currentMonth,
    year: currentYear,
    includeInactive: false,
  });

  // Active employees for payroll
  const activeEmployees = employees.filter(e => e.status === 'active');
  const selectedEmployee = formData.employeeId 
    ? employees.find(e => e.emp_id === formData.employeeId)
    : null;

  // Calculate totals
  const calculatePayrollAmount = () => {
    if (formData.payrollType === 'specific' && selectedEmployee) {
      return Number(selectedEmployee.salary);
    }
    
    const employeesToPay = formData.includeInactive 
      ? employees 
      : activeEmployees;
    
    return employeesToPay.reduce((sum, emp) => sum + Number(emp.salary), 0);
  };

  const totalAmount = calculatePayrollAmount();
  const employeeCount = formData.payrollType === 'specific' 
    ? 1 
    : (formData.includeInactive ? employees.length : activeEmployees.length);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.payrollType === 'specific' && !formData.employeeId) {
      alert('Please select an employee');
      return;
    }

    const monthStr = formData.month.toString().padStart(2, '0');
    const payrollData: PayrollData = {
      payrollType: formData.payrollType,
      employeeId: formData.payrollType === 'specific' ? Number(formData.employeeId) : undefined,
      month: `${formData.year}-${monthStr}`,
      year: formData.year,
      monthName: monthNames[formData.month - 1],
      includeInactive: formData.includeInactive,
    };

    await onSubmit(payrollData);
  };

  useEffect(() => {
    if (isOpen) {
      // Reset form when modal opens
      setFormData({
        payrollType: 'all',
        employeeId: '',
        month: currentMonth,
        year: currentYear,
        includeInactive: false,
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Process Payroll</h2>
              <p className="text-purple-100 text-sm">Pay employee salaries for the month</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Payroll Type Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              <Users className="w-4 h-4 inline mr-2" />
              Select Payroll Type *
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, payrollType: 'all', employeeId: '' })}
                className={`p-4 rounded-xl border-2 transition-all ${
                  formData.payrollType === 'all'
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                    : 'border-slate-300 dark:border-slate-700 hover:border-purple-300'
                }`}
              >
                <Users className={`w-8 h-8 mx-auto mb-2 ${
                  formData.payrollType === 'all' ? 'text-purple-600' : 'text-slate-400'
                }`} />
                <div className="font-semibold text-slate-900 dark:text-white">All Employees</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Pay all active employees
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, payrollType: 'specific' })}
                className={`p-4 rounded-xl border-2 transition-all ${
                  formData.payrollType === 'specific'
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                    : 'border-slate-300 dark:border-slate-700 hover:border-purple-300'
                }`}
              >
                <User className={`w-8 h-8 mx-auto mb-2 ${
                  formData.payrollType === 'specific' ? 'text-purple-600' : 'text-slate-400'
                }`} />
                <div className="font-semibold text-slate-900 dark:text-white">Specific Employee</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Pay one employee
                </div>
              </button>
            </div>
          </div>

          {/* Employee Selection (if specific) */}
          {formData.payrollType === 'specific' && (
            <div className="bg-purple-50 dark:bg-purple-900/10 p-4 rounded-xl border border-purple-200 dark:border-purple-800">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <User className="w-4 h-4 inline mr-2" />
                Choose Employee *
              </label>
              <select
                required
                value={formData.employeeId}
                onChange={(e) => setFormData({ ...formData, employeeId: Number(e.target.value) })}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              >
                <option value="">-- Select an Employee --</option>
                {activeEmployees.map((emp) => (
                  <option key={emp.emp_id} value={emp.emp_id}>
                    {emp.name} - {emp.job_title || 'Employee'} (${Number(emp.salary).toLocaleString()}/month)
                  </option>
                ))}
              </select>
              
              {selectedEmployee && (
                <div className="mt-3 p-3 bg-white dark:bg-slate-800 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">{selectedEmployee.name}</div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">{selectedEmployee.job_title}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-slate-600 dark:text-slate-400">Monthly Salary</div>
                      <div className="text-lg font-bold text-green-600 dark:text-green-400">
                        ${Number(selectedEmployee.salary).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Include Inactive Employees (only for "all" type) */}
          {formData.payrollType === 'all' && (
            <div className="flex items-center gap-3 p-4 bg-orange-50 dark:bg-orange-900/10 rounded-xl border border-orange-200 dark:border-orange-800">
              <input
                type="checkbox"
                id="includeInactive"
                checked={formData.includeInactive}
                onChange={(e) => setFormData({ ...formData, includeInactive: e.target.checked })}
                className="w-5 h-5 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
              />
              <label htmlFor="includeInactive" className="flex-1 cursor-pointer">
                <div className="font-medium text-slate-900 dark:text-white">Include Inactive Employees</div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Pay salaries to both active and inactive employees
                </div>
              </label>
              {formData.includeInactive && (
                <AlertCircle className="w-5 h-5 text-orange-500" />
              )}
            </div>
          )}

          {/* Month and Year Selection */}
          <div className="grid grid-cols-2 gap-4">
            {/* Month */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <Calendar className="w-4 h-4 inline mr-2" />
                Select Month *
              </label>
              <select
                required
                value={formData.month}
                onChange={(e) => setFormData({ ...formData, month: Number(e.target.value) })}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              >
                {monthNames.map((month, index) => (
                  <option key={index + 1} value={index + 1}>
                    {month}
                  </option>
                ))}
              </select>
            </div>

            {/* Year */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <Calendar className="w-4 h-4 inline mr-2" />
                Select Year *
              </label>
              <select
                required
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: Number(e.target.value) })}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              >
                {[currentYear - 1, currentYear, currentYear + 1].map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Summary Card */}
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="w-5 h-5" />
              <h3 className="text-lg font-bold">Payroll Summary</h3>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white/20 rounded-lg p-3">
                <div className="text-xs text-purple-100 mb-1">Period</div>
                <div className="font-bold">
                  {monthNames[formData.month - 1]} {formData.year}
                </div>
              </div>
              
              <div className="bg-white/20 rounded-lg p-3">
                <div className="text-xs text-purple-100 mb-1">Employees</div>
                <div className="font-bold text-2xl">{employeeCount}</div>
              </div>
              
              <div className="bg-white/20 rounded-lg p-3">
                <div className="text-xs text-purple-100 mb-1">Total Amount</div>
                <div className="font-bold text-2xl">${totalAmount.toLocaleString()}</div>
              </div>
            </div>

            {formData.payrollType === 'all' && (
              <div className="mt-4 pt-4 border-t border-white/20">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-purple-100">
                    {formData.includeInactive ? 'All' : 'Active'} employees will be paid
                  </span>
                  <Badge variant="success">
                    <CheckCircle className="w-3 h-3 inline mr-1" />
                    Ready to Process
                  </Badge>
                </div>
              </div>
            )}
          </div>

          {/* Warning for inactive employees */}
          {formData.payrollType === 'all' && !formData.includeInactive && employees.length > activeEmployees.length && (
            <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/10 rounded-xl border border-yellow-200 dark:border-yellow-800">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-yellow-900 dark:text-yellow-400">Note</div>
                <div className="text-sm text-yellow-700 dark:text-yellow-300">
                  {employees.length - activeEmployees.length} inactive employee(s) will not be paid. 
                  Check "Include Inactive Employees" if you want to pay them.
                </div>
              </div>
            </div>
          )}

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
              disabled={isLoading || (formData.payrollType === 'specific' && !formData.employeeId)}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl hover:from-purple-600 hover:to-purple-700 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/20"
            >
              {isLoading ? 'Processing...' : `Process Payroll ($${totalAmount.toLocaleString()})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
