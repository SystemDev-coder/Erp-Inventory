import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { ColumnDef } from '@tanstack/react-table';
import { BriefcaseBusiness, Plus, RefreshCw, ToggleRight, Users } from 'lucide-react';
import { PageHeader, TabActionToolbar } from '../../components/ui/layout';
import { Tabs } from '../../components/ui/tabs';
import { DataTable } from '../../components/ui/table/DataTable';
import Badge from '../../components/ui/badge/Badge';
import { useToast } from '../../components/ui/toast/Toast';
import { Employee, employeeService } from '../../services/employee.service';
import { userService, RoleRow } from '../../services/user.service';
import { EmployeeModal } from './EmployeeModal';
import { Modal } from '../../components/ui/modal/Modal';
import DeleteConfirmModal from '../../components/ui/modal/DeleteConfirmModal';

const Employees = () => {
  const location = useLocation();
  const { showToast } = useToast();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isStateModalOpen, setIsStateModalOpen] = useState(false);
  const [stateEmployeeId, setStateEmployeeId] = useState<number | ''>('');
  const [stateStatus, setStateStatus] = useState<'active' | 'inactive'>('active');

  const fetchEmployees = async (term?: string) => {
    setLoading(true);
    const res = await employeeService.list({ search: term || undefined });
    if (res.success && res.data?.employees) {
      setEmployees(res.data.employees);
    } else {
      showToast('error', 'HR', res.error || 'Failed to load employees');
    }
    setLoading(false);
  };

  useEffect(() => {
    userService.listRoles().then((res) => {
      if (res.success && res.data?.roles) setRoles(res.data.roles);
    });
  }, []);

  const handleSaveEmployee = async (payload: any) => {
    setIsSaving(true);
    const res = selectedEmployee
      ? await employeeService.update(selectedEmployee.emp_id, payload)
      : await employeeService.create(payload);
    if (res.success) {
      showToast('success', 'HR', selectedEmployee ? 'Employee updated' : 'Employee created');
      setIsEmployeeModalOpen(false);
      setSelectedEmployee(null);
      fetchEmployees(search);
    } else {
      showToast('error', 'HR', res.error || 'Failed to save employee');
    }
    setIsSaving(false);
  };

  const confirmDelete = async () => {
    if (!selectedEmployee) return;
    setIsDeleting(true);
    const res = await employeeService.delete(selectedEmployee.emp_id);
    if (res.success) {
      showToast('success', 'HR', 'Employee deleted');
      setIsDeleteOpen(false);
      setSelectedEmployee(null);
      fetchEmployees(search);
    } else {
      showToast('error', 'HR', res.error || 'Failed to delete employee');
    }
    setIsDeleting(false);
  };

  const saveEmployeeState = async () => {
    if (!stateEmployeeId) {
      showToast('error', 'Employee State', 'Select employee');
      return;
    }
    const res = await employeeService.update(Number(stateEmployeeId), { status: stateStatus });
    if (res.success) {
      showToast('success', 'Employee State', 'Status updated');
      setIsStateModalOpen(false);
      setStateEmployeeId('');
      fetchEmployees(search);
    } else {
      showToast('error', 'Employee State', res.error || 'Failed to update state');
    }
  };

  const columns: ColumnDef<Employee>[] = useMemo(
    () => [
      { accessorKey: 'full_name', header: 'Employee' },
      { accessorKey: 'phone', header: 'Phone', cell: ({ row }) => row.original.phone || '-' },
      { accessorKey: 'gender', header: 'Gender', cell: ({ row }) => row.original.gender || '-' },
      { accessorKey: 'role_name', header: 'Job', cell: ({ row }) => row.original.role_name || '-' },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge color={row.original.status === 'active' ? 'success' : 'warning'}>
            {row.original.status}
          </Badge>
        ),
      },
    ],
    []
  );

  const registrationTab = {
    id: 'registration',
    label: 'Employee Registration',
    icon: Users,
    content: (
      <div className="space-y-2">
        <TabActionToolbar
          title="Employee Registration"
          primaryAction={{
            label: 'New Employee',
            onClick: () => {
              setSelectedEmployee(null);
              setIsEmployeeModalOpen(true);
            },
          }}
          onDisplay={() => fetchEmployees(search)}
          onSearch={(value) => setSearch(value)}
        />
        <DataTable
          data={employees}
          columns={columns}
          isLoading={loading}
          searchPlaceholder="Search employees..."
          onEdit={(row) => {
            setSelectedEmployee(row);
            setIsEmployeeModalOpen(true);
          }}
          onDelete={(row) => {
            setSelectedEmployee(row);
            setIsDeleteOpen(true);
          }}
        />
      </div>
    ),
  };

  const jobTab = {
    id: 'job',
    label: 'Job',
    icon: BriefcaseBusiness,
    content: (
      <div className="space-y-2">
        <TabActionToolbar
          title="Job"
          primaryAction={{ label: 'Display', onClick: () => fetchEmployees(search) }}
          onDisplay={() => fetchEmployees(search)}
        />
        <DataTable data={employees} columns={columns} isLoading={loading} searchPlaceholder="Search job assignments..." />
      </div>
    ),
  };

  const stateTab = {
    id: 'state',
    label: 'Employee State',
    icon: ToggleRight,
    content: (
      <div className="space-y-2">
        <div className="flex justify-end gap-2">
          <button
            onClick={() => fetchEmployees(search)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <RefreshCw className="h-4 w-4" /> Display
          </button>
          <button
            onClick={() => setIsStateModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm text-white"
          >
            <Plus className="h-4 w-4" /> Set State
          </button>
        </div>
        <DataTable data={employees} columns={columns} isLoading={loading} searchPlaceholder="Search employee state..." />
      </div>
    ),
  };

  return (
    <div className="space-y-6">
      <PageHeader title="HR" description="Manage employee registration, job assignment, and employee state." />

      <Tabs
        tabs={[registrationTab, jobTab, stateTab]}
        defaultTab={
          location.pathname.endsWith('/job')
            ? 'job'
            : location.pathname.endsWith('/state')
            ? 'state'
            : 'registration'
        }
      />

      <EmployeeModal
        isOpen={isEmployeeModalOpen}
        onClose={() => {
          setIsEmployeeModalOpen(false);
          setSelectedEmployee(null);
        }}
        onSubmit={handleSaveEmployee}
        employee={selectedEmployee}
        roles={roles}
        isLoading={isSaving}
      />

      <DeleteConfirmModal
        isOpen={isDeleteOpen}
        onClose={() => {
          setIsDeleteOpen(false);
          setSelectedEmployee(null);
        }}
        onConfirm={confirmDelete}
        title="Delete Employee?"
        message="This action cannot be undone."
        itemName={selectedEmployee?.full_name}
        isDeleting={isDeleting}
      />

      <Modal
        isOpen={isStateModalOpen}
        onClose={() => setIsStateModalOpen(false)}
        title="Employee State"
        size="md"
      >
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Select Employee</span>
            <select
              className="w-full rounded-lg border px-3 py-2"
              value={stateEmployeeId}
              onChange={(e) => setStateEmployeeId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Select employee</option>
              {employees.map((employee) => (
                <option key={employee.emp_id} value={employee.emp_id}>
                  {employee.full_name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Status</span>
            <select
              className="w-full rounded-lg border px-3 py-2"
              value={stateStatus}
              onChange={(e) => setStateStatus(e.target.value as 'active' | 'inactive')}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setIsStateModalOpen(false)} className="rounded-lg border px-4 py-2">
              Cancel
            </button>
            <button type="button" onClick={saveEmployeeState} className="rounded-lg bg-primary-600 px-4 py-2 text-white">
              Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Employees;
