import { ArrowRightLeft, Clock, CheckCircle } from 'lucide-react';
import GenericSection from '../GenericSection';

const Transfers = () => {
    const tabs = [
        { id: 'list', label: 'Transfer List', icon: ArrowRightLeft },
        { id: 'new', label: 'New Transfer', icon: ArrowRightLeft },
        { id: 'transit', label: 'In Transit', icon: Clock },
        { id: 'received', label: 'Received', icon: CheckCircle },
    ];

    return (
        <GenericSection
            title="Transfers"
            description="Move stock between your different shop branches or warehouses."
            actionLabel="Move Stock"
            onAction={() => console.log('Move Stock')}
            tabs={tabs}
        />
    );
};

export default Transfers;
