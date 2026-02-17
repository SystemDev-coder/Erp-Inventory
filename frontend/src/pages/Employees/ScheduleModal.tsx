import { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/modal/Modal';
import { Calendar, Clock, FileText, Check, X } from 'lucide-react';
import { scheduleService, Schedule, ScheduleInput } from '../../services/schedule.service';
import { employeeService, Employee } from '../../services/employee.service';
import { useToast } from '../../components/ui/toast/Toast';
import Badge from '../../components/ui/badge/Badge';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedEmployee?: Employee | null;
}

const ScheduleModal = ({ isOpen, onClose, selectedEmployee }: Props) => {
  const { showToast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState<number | ''>('');
  
  // Form state
  const [formData, setFormData] = useState<ScheduleInput>({
    emp_id: 0,
    schedule_type: 'vacation',
    start_date: '',
    end_date: '',
    reason: '',
    notes: '',
  });

  useEffect(() => {
    if (isOpen) {
      fetchEmployees();
      if (selectedEmployee) {
        setSelectedEmpId(selectedEmployee.emp_id);
        fetchSchedules(selectedEmployee.emp_id);
        setFormData(prev => ({ ...prev, emp_id: selectedEmployee.emp_id }));
      } else {
        fetchSchedules();
      }
    }
  }, [isOpen, selectedEmployee]);

  const fetchEmployees = async () => {
    try {
      const response = await employeeService.list({ status: 'active' });
      if (response.success && response.data?.employees) {
        setEmployees(response.data.employees);
      }
    } catch (error) {
      // Silent fail
    }
  };

  const fetchSchedules = async (empId?: number) => {
    setLoading(true);
    try {
      const response = await scheduleService.list({ empId });
      if (response.success && response.data?.schedules) {
        setSchedules(response.data.schedules);
      }
    } catch (error) {
      showToast('error', 'Error', 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.emp_id || formData.emp_id === 0) {
      showToast('error', 'Validation Error', 'Please select an employee');
      return;
    }

    if (!formData.start_date || !formData.end_date) {
      showToast('error', 'Validation Error', 'Please select dates');
      return;
    }

    try {
      const response = await scheduleService.create(formData);
      if (response.success) {
        showToast('success', 'Success', 'Schedule created successfully');
        fetchSchedules(selectedEmpId ? Number(selectedEmpId) : undefined);
        // Reset form
        setFormData({
          emp_id: selectedEmployee?.emp_id || 0,
          schedule_type: 'vacation',
          start_date: '',
          end_date: '',
          reason: '',
          notes: '',
        });
      } else {
        throw new Error(response.error || 'Failed to create schedule');
      }
    } catch (error: any) {
      showToast('error', 'Error', error.message || 'Failed to create schedule');
    }
  };

  const handleStatusUpdate = async (scheduleId: number, status: 'approved' | 'rejected' | 'cancelled') => {
    try {
      const response = await scheduleService.updateStatus(scheduleId, status);
      if (response.success) {
        showToast('success', 'Success', `Schedule ${status}`);
        fetchSchedules(selectedEmpId ? Number(selectedEmpId) : undefined);
      } else {
        throw new Error(response.error || 'Failed to update schedule');
      }
    } catch (error: any) {
      showToast('error', 'Error', error.message || 'Failed to update schedule');
    }
  };

  const handleDelete = async (scheduleId: number) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;
    
    try {
      const response = await scheduleService.delete(scheduleId);
      if (response.success) {
        showToast('success', 'Success', 'Schedule deleted');
        fetchSchedules(selectedEmpId ? Number(selectedEmpId) : undefined);
      } else {
        throw new Error(response.error || 'Failed to delete schedule');
      }
    } catch (error: any) {
      showToast('error', 'Error', error.message || 'Failed to delete schedule');
    }
  };

  const getStatusColor = (status: string): 'success' | 'warning' | 'error' | 'info' | 'light' => {
    switch (status) {
      case 'approved': return 'success';
      case 'pending': return 'warning';
      case 'rejected': return 'error';
      case 'cancelled': return 'info';
      default: return 'light';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'sick_leave': return 'Sick Leave';
      case 'vacation': return 'Vacation';
      case 'personal': return 'Personal';
      case 'unpaid': return 'Unpaid';
      case 'other': return 'Other';
      default: return type;
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Employee Schedule & Leave Management"
      size="lg"
    >
      <div className="space-y-6">
        {/* Create New Schedule Form */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Request New Leave/Schedule</h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Employee Selection (if no employee pre-selected) */}
              {!selectedEmployee && (
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Employee *
                  </label>
                  <select
                    value={formData.emp_id}
                    onChange={(e) => setFormData({ ...formData, emp_id: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                    required
                  >
                    <option value="">Select employee...</option>
                    {employees.map(emp => (
                      <option key={emp.emp_id} value={emp.emp_id}>
                        {emp.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Schedule Type */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Type *
                </label>
                <select
                  value={formData.schedule_type}
                  onChange={(e) => setFormData({ ...formData, schedule_type: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  required
                >
                  <option value="vacation">Vacation</option>
                  <option value="sick_leave">Sick Leave</option>
                  <option value="personal">Personal</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Start Date *
                </label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  required
                />
              </div>

              {/* End Date */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  End Date *
                </label>
                <input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  required
                />
              </div>

              {/* Reason */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Reason
                </label>
                <input
                  type="text"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  placeholder="Brief reason for leave..."
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors font-medium text-sm"
            >
              Create Schedule
            </button>
          </form>
        </div>

        {/* Filter */}
        {!selectedEmployee && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Filter by Employee:</label>
            <select
              value={selectedEmpId}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedEmpId(value ? Number(value) : '');
                fetchSchedules(value ? Number(value) : undefined);
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            >
              <option value="">All Employees</option>
              {employees.map(emp => (
                <option key={emp.emp_id} value={emp.emp_id}>
                  {emp.full_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Schedules List */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
            {selectedEmployee ? `${selectedEmployee.full_name}'s Schedules` : 'All Schedules'}
          </h3>
          
          {loading ? (
            <div className="text-center py-8 text-slate-500">Loading schedules...</div>
          ) : schedules.length === 0 ? (
            <div className="text-center py-8 text-slate-500">No schedules found</div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {schedules.map(schedule => (
                <div
                  key={schedule.schedule_id}
                  className="bg-white dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-900 dark:text-white">{schedule.employee_name}</span>
                        <Badge color="primary" variant="light">{getTypeLabel(schedule.schedule_type)}</Badge>
                        <Badge color={getStatusColor(schedule.status)} variant="light">
                          {schedule.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(schedule.start_date).toLocaleDateString()} - {new Date(schedule.end_date).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {schedule.days_count} days
                        </span>
                      </div>
                      {schedule.reason && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 flex items-start gap-1">
                          <FileText className="w-3 h-3 mt-0.5" />
                          {schedule.reason}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      {schedule.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleStatusUpdate(schedule.schedule_id, 'approved')}
                            className="p-1.5 hover:bg-green-50 dark:hover:bg-green-900/20 rounded text-green-600"
                            title="Approve"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleStatusUpdate(schedule.schedule_id, 'rejected')}
                            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-red-600"
                            title="Reject"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDelete(schedule.schedule_id)}
                        className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-red-600 text-xs"
                        title="Delete"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-600 text-white hover:bg-slate-700 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ScheduleModal;
