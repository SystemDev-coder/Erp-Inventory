import { Users, Shield, Lock, History } from 'lucide-react';
import GenericSection from '../GenericSection';

const System = () => {
    const tabs = [
        { id: 'users', label: 'Users', icon: Users },
        { id: 'roles', label: 'Roles', icon: Shield },
        { id: 'permissions', label: 'Permissions', icon: Lock },
        { id: 'logs', label: 'Activity Logs', icon: History },
    ];

    return (
        <GenericSection
            title="System & Security"
            description="Manage system access and track who did what in the system."
            actionLabel="Add User"
            onAction={() => console.log('Add User')}
            tabs={tabs}
        />
    );
};

export default System;
