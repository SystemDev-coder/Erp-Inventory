import React from 'react';
import { Breadcrumbs } from './Breadcrumbs';

interface PageHeaderProps {
    title: string;
    breadcrumbs?: Array<{ label: string; href?: string }>;
    actions?: React.ReactNode;
    description?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
    title,
    breadcrumbs,
    actions,
    description,
}) => {
    return (
        <div className="mb-6">
            {breadcrumbs && breadcrumbs.length > 0 && (
                <div className="mb-3">
                    <Breadcrumbs items={breadcrumbs} />
                </div>
            )}

            <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                        {title}
                    </h1>
                    {description && (
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                            {description}
                        </p>
                    )}
                </div>

                {actions && <div className="flex items-center gap-3">{actions}</div>}
            </div>
        </div>
    );
};
