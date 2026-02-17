import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  DollarSign,
  Phone,
  Calendar,
  Search,
  Plus,
  Edit,
  Trash2,
  ToggleLeft,
  ToggleRight,
  BriefcaseBusiness,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { ColumnDef } from '@tanstack/react-table';
import { PageHeader } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import Badge from '../../components/ui/badge/Badge';
import { useToast } from '../../components/ui/toast/Toast';
import { employeeService, Employee } from '../../services/employee.service';
import { userService, RoleRow } from '../../services/user.service';
import { EmployeeModal } from './EmployeeModal';
import ShiftModal from './ShiftModal';
import DeleteConfirmModal from '../../components/ui/modal/DeleteConfirmModal';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';

const Employees = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isStatusChangeModalOpen, setIsStatusChangeModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [employeeToToggleStatus, setEmployeeToToggleStatus] = useState<Employee | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    totalSalaries: 0,
  });

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const response = await employeeService.list({
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });

      if (response.success && response.data?.employees) {
        setEmployees(response.data.employees);
        const total = response.data.employees.length;
        const active = response.data.employees.filter((e) => e.status === 'active').length;
        const inactive = response.data.employees.filter((e) => e.status === 'inactive').length;
        const totalSalaries = response.data.employees
          .filter((e) => e.status === 'active')
          .reduce((sum, e) => sum + Number(e.basic_salary || 0), 0);
        setStats({ total, active, inactive, totalSalaries });
      } else {
        showToast('error', 'Failed to load employees', response.error || 'Unknown error');
      }
    } catch (_error) {
      showToast('error', 'Error', 'Failed to fetch employees');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const response = await userService.listRoles();
      if (response.success && response.data?.roles) {
        setRoles(response.data.roles);
      }
    } catch (_error) {
      // no-op
    }
  };

  useEffect(() => {
    fetchEmployees();
    fetchRoles();
  }, [statusFilter]);

  useEffect(() => {
    if (location.pathname.endsWith('/shifts')) {
      setIsShiftModalOpen(true);
      return;
    }
    setIsShiftModalOpen(false);
  }, [location.pathname]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchEmployees();
  };

  const handleAdd = () => {
    setSelectedEmployee(null);
    setIsModalOpen(true);
  };

  const handleEdit = (employee: Employee) => {
    setSelectedEmployee(employee);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (employee: Employee) => {
    setSelectedEmployee(employee);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedEmployee) return;
    setIsDeleting(true);
    try {
      const response = await employeeService.delete(selectedEmployee.emp_id);
      if (response.success) {
        showToast('success', 'Success', 'Employee deleted successfully');
        setIsDeleteModalOpen(false);
        setSelectedEmployee(null);
        fetchEmployees();
      } else {
        showToast('error', 'Error', response.error || 'Failed to delete employee');
      }
    } catch (_error) {
      showToast('error', 'Error', 'Failed to delete employee');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      const response = selectedEmployee
        ? await employeeService.update(selectedEmployee.emp_id, data)
        : await employeeService.create(data);

      if (response.success) {
        showToast('success', 'Success', selectedEmployee ? 'Employee updated' : 'Employee created');
        setIsModalOpen(false);
        fetchEmployees();
      } else {
        showToast('error', 'Failed', response.error || 'Could not save employee');
      }
    } catch (_error) {
      showToast('error', 'Error', 'Failed to save employee');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChangeClick = useCallback((employee: Employee) => {
    setEmployeeToToggleStatus(employee);
    setIsStatusChangeModalOpen(true);
  }, []);

  const handleToggleStatusConfirm = async () => {
    const employee = employeeToToggleStatus;
    if (!employee) return;

    const newStatus = employee.status === 'active' ? 'inactive' : 'active';

    try {
      const response = await employeeService.update(employee.emp_id, { status: newStatus });
      if (response.success) {
        showToast('success', 'Status Updated', `${employee.full_name} is now ${newStatus}`);
        fetchEmployees();
      } else {
        showToast('error', 'Update failed', response.error || 'Could not update status');
      }
    } catch (_error) {
      showToast('error', 'Error', 'Failed to update employee status');
    }
  };

  const handleShiftClick = () => {
    navigate('/employees/shifts');
  };

  const handleShiftClose = () => {
    setIsShiftModalOpen(false);
    if (location.pathname.endsWith('/shifts')) {
      navigate('/employees');
    }
  };

  const columns: ColumnDef<Employee>[] = useMemo(
    () => [
      {
        accessorKey: 'full_name',
        header: 'Name',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <div className="font-semibold text-slate-900 dark:text-white">
                {row.original.full_name}
              </div>
              {row.original.role_name && (
                <div className="text-xs text-slate-500 dark:text-slate-400">{row.original.role_name}</div>
              )}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'phone',
        header: 'Phone',
        cell: ({ row }) => (
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <Phone className="w-4 h-4" />
            {row.original.phone || '-'}
          </div>
        ),
      },
      {
        accessorKey: 'basic_salary',
        header: 'Salary',
        cell: ({ row }) => (
          <div className="font-semibold text-green-600 dark:text-green-400">
            $
            {Number(row.original.basic_salary || 0).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        ),
      },
      {
        accessorKey: 'hire_date',
        header: 'Hire Date',
        cell: ({ row }) => (
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <Calendar className="w-4 h-4" />
            {new Date(row.original.hire_date).toLocaleDateString()}
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.original.status;
          const statusColors: Record<string, 'success' | 'warning' | 'error'> = {
            active: 'success',
            inactive: 'warning',
            terminated: 'error',
          };
          return (
            <div className="flex items-center gap-2">
              <Badge color={statusColors[status] || 'warning'}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Badge>
              {status !== 'terminated' && (
                <button
                  onClick={() => handleStatusChangeClick(row.original)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    status === 'active'
                      ? 'hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-600'
                      : 'hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600'
                  }`}
                  title={status === 'active' ? 'Deactivate' : 'Activate'}
                >
                  {status === 'active' ? (
                    <ToggleRight className="w-5 h-5" />
                  ) : (
                    <ToggleLeft className="w-5 h-5" />
                  )}
                </button>
              )}
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleEdit(row.original)}
              className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg transition-colors"
              title="Edit"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleDeleteClick(row.original)}
              className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg transition-colors"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ),
      },
    ],
    [handleStatusChangeClick]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="Manage your staff, their information, and employment details"
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={handleShiftClick}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-indigo-600 hover:to-indigo-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
            >
              <BriefcaseBusiness className="w-5 h-5" />
              Shift
            </button>

            <button
              onClick={handleAdd}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20 active:scale-95"
            >
              <Plus className="w-5 h-5" />
              Add Employee
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <Users className="w-8 h-8 opacity-80" />
            <span className="text-3xl font-bold">{stats.total}</span>
          </div>
          <div className="text-blue-100 text-sm font-medium">Total Employees</div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <Users className="w-8 h-8 opacity-80" />
            <span className="text-3xl font-bold">{stats.active}</span>
          </div>
          <div className="text-green-100 text-sm font-medium">Active</div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <Users className="w-8 h-8 opacity-80" />
            <span className="text-3xl font-bold">{stats.inactive}</span>
          </div>
          <div className="text-orange-100 text-sm font-medium">Inactive</div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-8 h-8 opacity-80" />
            <span className="text-2xl font-bold">${stats.totalSalaries.toLocaleString()}</span>
          </div>
          <div className="text-purple-100 text-sm font-medium">Total Salaries/Month</div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg">
        <div className="border-b border-slate-200 dark:border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Employees List</h3>
          </div>
        </div>

        <div className="p-6 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-col md:flex-row gap-4">
            <form onSubmit={handleSearch} className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search employees by name, phone, or role..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                />
              </div>
            </form>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="terminated">Terminated</option>
            </select>

            <button
              onClick={handleSearch}
              className="px-6 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors"
            >
              Search
            </button>
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
          ) : employees.length === 0 ? (
            <div className="text-center py-20">
              <Users className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-700 mb-4" />
              <h3 className="text-lg font-semibold text-slate-600 dark:text-slate-400 mb-2">
                No employees found
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-500 mb-6">
                {search ? 'Try adjusting your search criteria' : 'Get started by adding your first employee'}
              </p>
              {!search && (
                <button
                  onClick={handleAdd}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  Add First Employee
                </button>
              )}
            </div>
          ) : (
            <DataTable
              data={employees}
              columns={columns}
              searchPlaceholder="Search employees..."
              enableRowSelection={false}
              enableColumnVisibility={true}
            />
          )}
        </div>
      </div>

      <EmployeeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmit}
        employee={selectedEmployee}
        roles={roles}
        isLoading={isSubmitting}
      />

      <ShiftModal isOpen={isShiftModalOpen} onClose={handleShiftClose} />

      <ConfirmDialog
        isOpen={isStatusChangeModalOpen}
        onClose={() => {
          setIsStatusChangeModalOpen(false);
          setEmployeeToToggleStatus(null);
        }}
        onConfirm={handleToggleStatusConfirm}
        title="Change Status?"
        message={
          employeeToToggleStatus
            ? `Are you sure you want to change ${employeeToToggleStatus.full_name}'s status from ${employeeToToggleStatus.status} to ${employeeToToggleStatus.status === 'active' ? 'inactive' : 'active'}?`
            : ''
        }
        confirmText="Yes, Change"
        variant="warning"
      />

      <DeleteConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedEmployee(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="Delete Employee?"
        message="Are you sure you want to delete this employee?"
        itemName={selectedEmployee?.full_name}
        isDeleting={isDeleting}
      />
    </div>
  );
};

export default Employees;

