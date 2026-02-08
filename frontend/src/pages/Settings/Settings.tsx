import { Home, Building, DollarSign, Tag, Database } from 'lucide-react';
import GenericSection from '../GenericSection';

const Settings = () => {
    const tabs = [
        { id: 'company', label: 'Company Info', icon: Home },
        { id: 'branches', label: 'Branches', icon: Building },
        { id: 'units', label: 'Units & Currency', icon: DollarSign },
        { id: 'tax', label: 'Tax & Discounts', icon: Tag },
        { id: 'backup', label: 'Backup', icon: Database },
    ];

    return (
        <GenericSection
            title="Settings"
            description="Configure how your inventory system works for your business."
            tabs={tabs}
        />
    );
};

export default Settings;
