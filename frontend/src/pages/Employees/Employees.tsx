import { Users, Clock, DollarSign, Wallet, History } from 'lucide-react';
import GenericSection from '../GenericSection';

const Employees = () => {
    const tabs = [
        { id: 'list', label: 'Employees List', icon: Users },
        { id: 'attendance', label: 'Attendance', icon: Clock },
        { id: 'salaries', label: 'Salaries', icon: DollarSign },
        { id: 'payroll', label: 'Payroll', icon: Wallet },
        { id: 'loans', label: 'Loans', icon: History },
    ];

    return (
        <GenericSection
            title="Employees"
            description="Manage your staff, their presence, and their monthly pay."
            actionLabel="Add Employee"
            onAction={() => console.log('Add Employee')}
            tabs={tabs}
        />
    );
};

export default Employees;
