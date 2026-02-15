import { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/modal/Modal';
import { User, UserPlus, Check, Copy, Eye, EyeOff, Loader } from 'lucide-react';
import { employeeService, Employee } from '../../services/employee.service';
import { userService } from '../../services/user.service';
import { useToast } from '../../components/ui/toast/Toast';
import Badge from '../../components/ui/badge/Badge';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface EmployeeWithCredentials extends Employee {
  generatedUsername?: string;
  generatedPassword?: string;
  isGenerating?: boolean;
  isGenerated?: boolean;
}

const GenerateUsersListModal = ({ isOpen, onClose, onSuccess }: Props) => {
  const { showToast } = useToast();
  const [employees, setEmployees] = useState<EmployeeWithCredentials[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      fetchEmployees();
    }
  }, [isOpen]);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const response = await employeeService.list({ status: 'active' });
      if (response.success && response.data?.employees) {
        const employeesWithCreds: EmployeeWithCredentials[] = response.data.employees.map(emp => ({
          ...emp,
          // Pre-generate what the username WOULD be
          generatedUsername: emp.full_name
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '.')
            .replace(/[^a-z0-9.]/g, ''),
          isGenerated: !!emp.user_id,
        }));
        setEmployees(employeesWithCreds);
      }
    } catch (error) {
      showToast('error', 'Error', 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async (employee: EmployeeWithCredentials) => {
    if (!employee.role_id) {
      showToast('error', 'No Role', 'Please assign a role to this employee first');
      return;
    }

    setEmployees(prev =>
      prev.map(emp =>
        emp.emp_id === employee.emp_id ? { ...emp, isGenerating: true } : emp
      )
    );

    try {
      const response = await userService.generateFromEmployee({ empId: employee.emp_id });
      
      if (response.success && response.data) {
        const { username, password } = response.data;
        
        setEmployees(prev =>
          prev.map(emp =>
            emp.emp_id === employee.emp_id
              ? {
                  ...emp,
                  isGenerating: false,
                  isGenerated: true,
                  generatedUsername: username,
                  generatedPassword: password,
                  user_id: response.data.user.user_id,
                }
              : emp
          )
        );

        showToast('success', 'User Generated!', `Account created for ${employee.full_name}`);
        onSuccess();
      } else {
        throw new Error(response.error || 'Failed to generate user');
      }
    } catch (error: any) {
      showToast('error', 'Generation Failed', error.message || 'Could not create user account');
      setEmployees(prev =>
        prev.map(emp =>
          emp.emp_id === employee.emp_id ? { ...emp, isGenerating: false } : emp
        )
      );
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast('success', 'Copied!', `${label} copied to clipboard`);
  };

  const togglePasswordVisibility = (empId: number) => {
    setShowPasswords(prev => ({ ...prev, [empId]: !prev[empId] }));
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={
        <div className="flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-primary-600" />
          <span>Generate Users from Employees</span>
        </div>
      }
      size="medium"
    >
      <div className="space-y-3">
        {/* Info Banner */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-2 text-xs text-blue-800 dark:text-blue-200">
          <p className="font-medium">👥 Employee User Management</p>
          <p className="text-[10px] mt-0.5">
            Click "Generate" to create accounts. Credentials are auto-generated. Save passwords - shown only once!
          </p>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-6">
            <Loader className="w-5 h-5 animate-spin text-primary-600" />
            <span className="ml-2 text-sm text-slate-600 dark:text-slate-400">Loading employees...</span>
          </div>
        )}

        {/* Employees Table */}
        {!loading && employees.length > 0 && (
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-semibold text-slate-700 dark:text-slate-300">Name</th>
                    <th className="text-left p-2 font-semibold text-slate-700 dark:text-slate-300">Role</th>
                    <th className="text-left p-2 font-semibold text-slate-700 dark:text-slate-300">Username</th>
                    <th className="text-left p-2 font-semibold text-slate-700 dark:text-slate-300">Password</th>
                    <th className="text-center p-2 font-semibold text-slate-700 dark:text-slate-300">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {employees.map((employee) => (
                    <tr key={employee.emp_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      {/* Name */}
                      <td className="p-2">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span className="font-medium text-slate-900 dark:text-white">{employee.full_name}</span>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="p-2">
                        {employee.role_name ? (
                          <Badge color="info" className="text-[10px]">{employee.role_name}</Badge>
                        ) : (
                          <span className="text-[10px] text-slate-500">No role</span>
                        )}
                      </td>

                      {/* Username */}
                      <td className="p-2">
                        {(employee.isGenerated || employee.generatedPassword) ? (
                          <div className="flex items-center gap-1">
                            <code className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                              {employee.generatedUsername || employee.username}
                            </code>
                            <button
                              onClick={() => copyToClipboard(employee.generatedUsername || employee.username || '', 'Username')}
                              className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                              title="Copy"
                            >
                              <Copy className="w-3 h-3 text-slate-600 dark:text-slate-400" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400">{employee.generatedUsername}</span>
                        )}
                      </td>

                      {/* Password */}
                      <td className="p-2">
                        {employee.generatedPassword ? (
                          <div className="flex items-center gap-1">
                            <code className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                              {showPasswords[employee.emp_id] ? employee.generatedPassword : '••••••••'}
                            </code>
                            <button
                              onClick={() => togglePasswordVisibility(employee.emp_id)}
                              className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
                              title={showPasswords[employee.emp_id] ? 'Hide' : 'Show'}
                            >
                              {showPasswords[employee.emp_id] ? (
                                <EyeOff className="w-3 h-3 text-slate-600 dark:text-slate-400" />
                              ) : (
                                <Eye className="w-3 h-3 text-slate-600 dark:text-slate-400" />
                              )}
                            </button>
                            <button
                              onClick={() => copyToClipboard(employee.generatedPassword || '', 'Password')}
                              className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
                              title="Copy"
                            >
                              <Copy className="w-3 h-3 text-slate-600 dark:text-slate-400" />
                            </button>
                          </div>
                        ) : employee.isGenerated ? (
                          <span className="text-[10px] text-slate-400">Already has account</span>
                        ) : (
                          <span className="text-[10px] text-slate-400">-</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="p-2 text-center">
                        {employee.isGenerated && !employee.generatedPassword ? (
                          <Badge color="success" className="text-[10px]">
                            <Check className="w-2.5 h-2.5 inline mr-0.5" />
                            Done
                          </Badge>
                        ) : employee.generatedPassword ? (
                          <Badge color="success" className="text-[10px]">
                            <Check className="w-2.5 h-2.5 inline mr-0.5" />
                            Created
                          </Badge>
                        ) : (
                          <button
                            onClick={() => handleGenerate(employee)}
                            disabled={employee.isGenerating || !employee.role_id}
                            className="px-3 py-1 bg-primary-600 text-white text-[10px] font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            title={!employee.role_id ? 'Assign role first' : ''}
                          >
                            {employee.isGenerating ? 'Wait...' : 'Generate'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && employees.length === 0 && (
          <div className="text-center py-8">
            <User className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
            <p className="text-sm text-slate-600 dark:text-slate-400">No active employees found</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default GenerateUsersListModal;
