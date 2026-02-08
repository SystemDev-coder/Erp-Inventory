import { ShoppingCart, ShoppingBag, Clock, FileText } from 'lucide-react';
import GenericSection from '../GenericSection';

const Purchases = () => {
    const tabs = [
        { id: 'list', label: 'Purchase List', icon: ShoppingBag },
        { id: 'new', label: 'New Purchase', icon: ShoppingCart },
        { id: 'receiving', label: 'Receiving', icon: Clock },
        { id: 'suppliers', label: 'Suppliers', icon: FileText },
    ];

    return (
        <GenericSection
            title="Purchases"
            description="Manage everything you buy from your suppliers."
            actionLabel="Add Purchase"
            onAction={() => console.log('Add Purchase')}
            tabs={tabs}
        />
    );
};

export default Purchases;
