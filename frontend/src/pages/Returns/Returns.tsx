import { RotateCcw, ShoppingBag, History } from 'lucide-react';
import GenericSection from '../GenericSection';

const Returns = () => {
    const tabs = [
        { id: 'sales', label: 'Sales Returns', icon: RotateCcw },
        { id: 'purchase', label: 'Purchase Returns', icon: ShoppingBag },
        { id: 'history', label: 'Return History', icon: History },
    ];

    return (
        <GenericSection
            title="Returns"
            description="Track items returned by customers or items you send back to suppliers."
            actionLabel="Record Return"
            onAction={() => console.log('Record Return')}
            tabs={tabs}
        />
    );
};

export default Returns;
