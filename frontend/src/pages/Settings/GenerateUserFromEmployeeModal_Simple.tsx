import { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/modal/Modal';
import { User, UserPlus, Check, Copy, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { employeeService, Employee } from '../../services/employee.service';
import { useToast } from '../../components/ui/toast/Toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (empId: number) => Promise<{ username: string; password: string } | null>;
}

const GenerateUserFromEmployeeModalSimple = ({ isOpen, onClose, onGenerate }: Props) => {
  const { showToast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState<number | ''>('');
  
  // Generated credentials
  const [generatedUsername, setGeneratedUsername] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [showPassword, setShowPassword] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);

  // Fetch employees without user accounts
  useEffect(() => {
    if (isOpen) {
      fetchEmployeesWithoutUsers();
      // Reset state
      setSelectedEmpId('');
      setGeneratedUsername('');
      setGeneratedPassword('');
      setShowSuccess(false);
      setShowPassword(true);
    }
  }, [isOpen]);

  const fetchEmployeesWithoutUsers = async () => {
    setLoadingEmployees(true);
    try {
      const response = await employeeService.list({ status: 'active' });
      if (response.success && response.data?.employees) {
        // Filter only employees without user accounts AND with role assigned
        const employeesWithoutUsers = response.data.employees.filter(
          (emp) => !emp.user_id && emp.role_id
        );
        setEmployees(employeesWithoutUsers);
        
        if (employeesWithoutUsers.length === 0) {
          showToast('info', 'No Employees Available', 'All employees either have user accounts or need a role assigned');
        }
      }
    } catch (error) {
      showToast('error', 'Error', 'Failed to load employees');
    } finally {
      setLoadingEmployees(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedEmpId) {
      showToast('error', 'Validation Error', 'Please select an employee');
      return;
    }

    setGenerating(true);
    try {
      const result = await onGenerate(Number(selectedEmpId));
      if (result) {
        setGeneratedUsername(result.username);
        setGeneratedPassword(result.password);
        setShowSuccess(true);
        showToast('success', 'User Generated!', 'Employee can now login with these credentials');
      }
    } catch (error) {
      // Error already handled by parent
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast('success', 'Copied!', `${label} copied to clipboard`);
  };

  const handleClose = () => {
    setShowSuccess(false);
    setGeneratedUsername('');
    setGeneratedPassword('');
    setSelectedEmpId('');
    onClose();
  };

  const selectedEmployee = employees.find((e) => e.emp_id === selectedEmpId);

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={handleClose} 
      title={
        <div className="flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-primary-600" />
          <span>Generate User from Employee</span>
        </div>
      }
    >
      {!showSuccess ? (
        /* GENERATION FORM */
        <div className="space-y-4">
          {/* Info Banner */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-200">
            <p className="font-medium mb-1">🎯 Auto-Generate User Account</p>
            <p className="text-xs">Select an employee and click "Generate". Username and password will be created automatically from their name.</p>
          </div>

          {/* Employee Selection */}
          <label className="flex flex-col text-sm font-medium gap-2 text-slate-800 dark:text-slate-200">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4" />
              Select Employee *
            </div>
            <select
              className="rounded-lg border px-4 py-3 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent text-base"
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value ? Number(e.target.value) : '')}
              disabled={loadingEmployees || generating}
            >
              <option value="">
                {loadingEmployees ? 'Loading employees...' : 'Choose an employee...'}
              </option>
              {employees.map((emp) => (
                <option key={emp.emp_id} value={emp.emp_id}>
                  {emp.full_name} • {emp.role_name || 'No role'} • ${Number(emp.basic_salary || 0).toLocaleString()}
                </option>
              ))}
            </select>
            {employees.length === 0 && !loadingEmployees && (
              <div className="flex items-start gap-2 text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 rounded p-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">No employees available</p>
                  <p>All employees either have user accounts or need a role assigned in the Employees page</p>
                </div>
              </div>
            )}
          </label>

          {/* Selected Employee Details */}
          {selectedEmployee && (
            <div className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-700 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-3 uppercase tracking-wide">Selected Employee</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Name</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{selectedEmployee.full_name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Role</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{selectedEmployee.role_name || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Phone</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{selectedEmployee.phone || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Salary</p>
                  <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                    ${Number(selectedEmployee.basic_salary || 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Auto-Generation Info */}
          {selectedEmployee && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-200">
              <p className="font-medium mb-1">✨ What will be generated:</p>
              <ul className="space-y-1 ml-4 list-disc">
                <li><strong>Username:</strong> Based on employee name (e.g., "ahmed.hassan")</li>
                <li><strong>Password:</strong> Name + Year + Special chars (e.g., "Ahmed2026@123")</li>
                <li><strong>Role:</strong> {selectedEmployee.role_name}</li>
                <li><strong>Branch:</strong> Employee's current branch</li>
              </ul>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-medium"
              disabled={generating}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || !selectedEmpId}
              className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-green-600 to-green-700 text-white hover:from-green-700 hover:to-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg flex items-center gap-2 font-semibold"
            >
              {generating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Generate
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* SUCCESS VIEW */
        <div className="space-y-4">
          {/* Success Banner */}
          <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-500 dark:border-green-600 rounded-lg p-4 text-center">
            <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-3">
              <Check className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-lg font-bold text-green-900 dark:text-green-100 mb-1">
              User Account Generated!
            </h3>
            <p className="text-sm text-green-700 dark:text-green-300">
              {selectedEmployee?.full_name} can now login to the system
            </p>
          </div>

          {/* Generated Credentials */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              Save these credentials - they won't be shown again!
            </p>

            {/* Username */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">
                Username
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-base font-mono font-semibold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded border border-slate-200 dark:border-slate-700">
                  {generatedUsername}
                </code>
                <button
                  onClick={() => copyToClipboard(generatedUsername, 'Username')}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                  title="Copy username"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Password */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">
                Password
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-base font-mono font-semibold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded border border-slate-200 dark:border-slate-700">
                  {showPassword ? generatedPassword : '••••••••••••'}
                </code>
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => copyToClipboard(generatedPassword, 'Password')}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                  title="Copy password"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-800 dark:text-blue-200">
            <p className="font-medium mb-2">📋 Next Steps:</p>
            <ol className="space-y-1 ml-4 list-decimal">
              <li>Copy both username and password</li>
              <li>Share with {selectedEmployee?.full_name}</li>
              <li>Employee can login immediately</li>
              <li>Recommend changing password after first login</li>
            </ol>
          </div>

          {/* Close Button */}
          <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={handleClose}
              className="px-6 py-2.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors font-semibold shadow-md"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default GenerateUserFromEmployeeModalSimple;
