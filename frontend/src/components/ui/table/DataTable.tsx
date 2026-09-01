import { useId, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import {
    useReactTable,
    getCoreRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    getFilteredRowModel,
    ColumnDef,
    flexRender,
    SortingState,
    ColumnFiltersState,
    VisibilityState,
    Row,
} from '@tanstack/react-table';
import {
    ChevronDown,
    ChevronUp,
    ChevronsUpDown,
    Search,
    Settings2,
    Eye,
    Edit,
    Trash2,
    X,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';
import { ActionDropdown } from '../dropdown/ActionDropdown';

type ColumnMeta = {
    hideOnMobile?: boolean;
};

interface DataTableProps<TData> {
    data: TData[];
    columns: ColumnDef<TData, unknown>[];
    searchPlaceholder?: string;
    onView?: (row: TData) => void;
    onEdit?: (row: TData) => void;
    onDelete?: (row: TData) => void;
    canDelete?: (row: TData) => boolean;
    enableRowSelection?: boolean;
    enableColumnVisibility?: boolean;
    isLoading?: boolean;
    error?: string | null;
    showToolbarActions?: boolean;
    className?: string;
    headerClassName?: string;
    rowHoverClassName?: string;
    mobileCardRender?: (row: TData) => ReactNode;
}

const headerLabel = (header: unknown): string => {
    if (typeof header === 'string') return header;
    return '';
};

export function DataTable<TData>({
    data,
    columns,
    searchPlaceholder = 'Search...',
    onView,
    onEdit,
    onDelete,
    canDelete,
    enableRowSelection = false,
    enableColumnVisibility = true,
    isLoading = false,
    error = null,
    showToolbarActions = true,
    className,
    headerClassName,
    rowHoverClassName,
    mobileCardRender,
}: DataTableProps<TData>) {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
    const [rowSelection, setRowSelection] = useState({});
    const [globalFilter, setGlobalFilter] = useState('');
    const searchId = useId();
    const pageSizeId = useId();

    const columnsWithActions = useMemo(() => {
        const next: ColumnDef<TData, unknown>[] = [];

        if (enableRowSelection) {
            next.push({
                id: 'select',
                enableSorting: false,
                enableHiding: false,
                header: ({ table }) => (
                    <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={table.getIsAllPageRowsSelected()}
                        ref={(el) => {
                            if (el) el.indeterminate = table.getIsSomePageRowsSelected();
                        }}
                        onChange={table.getToggleAllPageRowsSelectedHandler()}
                        aria-label="Select all rows on this page"
                    />
                ),
                cell: ({ row }) => (
                    <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={row.getIsSelected()}
                        disabled={!row.getCanSelect()}
                        onChange={row.getToggleSelectedHandler()}
                        aria-label="Select row"
                    />
                ),
            });
        }

        next.push(...columns);

        if (!onView && !onEdit && !onDelete) return next;

        const actionsColumn: ColumnDef<TData, unknown> = {
            id: 'actions',
            header: 'Actions',
            enableHiding: false,
            cell: ({ row }) => {
                return (
                    <div className="flex items-center gap-2">
                        {onView && (
                            <button
                                type="button"
                                onClick={() => onView(row.original)}
                                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-primary-700 dark:text-slate-200 dark:hover:bg-slate-800/60 dark:hover:text-slate-100"
                                title="View"
                                aria-label="View"
                            >
                                <Eye className="w-4 h-4" aria-hidden="true" />
                            </button>
                        )}
                        {onEdit && (
                            <button
                                type="button"
                                onClick={() => onEdit(row.original)}
                                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-primary-700 dark:text-slate-200 dark:hover:bg-slate-800/60 dark:hover:text-slate-100"
                                title="Edit"
                                aria-label="Edit"
                            >
                                <Edit className="w-4 h-4" aria-hidden="true" />
                            </button>
                        )}
                        {onDelete &&
                            (canDelete ? canDelete(row.original) : true) && (
                                <button
                                    type="button"
                                    onClick={() => onDelete(row.original)}
                                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-200 dark:hover:bg-red-900/30 dark:hover:text-red-200"
                                    title="Delete"
                                    aria-label="Delete"
                                >
                                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                                </button>
                            )}
                    </div>
                );
            },
        };

        return [...next, actionsColumn];
    }, [columns, onView, onEdit, onDelete, canDelete, enableRowSelection]);

    const table = useReactTable({
        data,
        columns: columnsWithActions,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: setColumnVisibility,
        onRowSelectionChange: setRowSelection,
        onGlobalFilterChange: setGlobalFilter,
        state: {
            sorting,
            columnFilters,
            columnVisibility,
            rowSelection,
            globalFilter,
        },
        enableRowSelection,
    });

    const selectedRowsCount = Object.keys(rowSelection).length;

    const renderMobileCard = (row: Row<TData>) => {
        if (mobileCardRender) return mobileCardRender(row.original);

        return (
            <div className="space-y-2">
                {row.getVisibleCells().map((cell) => {
                    const hideOnMobile = (cell.column.columnDef.meta as ColumnMeta | undefined)?.hideOnMobile;
                    if (hideOnMobile || cell.column.id === 'select') return null;
                    const label =
                        headerLabel(cell.column.columnDef.header) ||
                        cell.column.id.replace(/_/g, ' ');
                    return (
                        <div key={cell.id} className="flex items-start justify-between gap-3">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                {label}
                            </span>
                            <div className="text-right text-sm text-slate-900 dark:text-slate-100">
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const ariaSortValue = (sorted: false | 'asc' | 'desc') => {
        if (sorted === 'asc') return 'ascending' as const;
        if (sorted === 'desc') return 'descending' as const;
        return 'none' as const;
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="relative w-full sm:max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-slate-300" aria-hidden="true" />
                    <label htmlFor={searchId} className="sr-only">
                        {searchPlaceholder}
                    </label>
                    <input
                        id={searchId}
                        type="search"
                        placeholder={searchPlaceholder}
                        value={globalFilter ?? ''}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                        aria-label={searchPlaceholder}
                        className="w-full min-h-11 rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 shadow-sm transition-all hover:border-slate-300 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/25 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-600 dark:placeholder:text-slate-400"
                    />
                </div>

                {showToolbarActions && enableColumnVisibility && (
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <ActionDropdown
                            trigger={
                                <button
                                    type="button"
                                    aria-label="Toggle column visibility"
                                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800/60"
                                >
                                    <Settings2 className="w-4 h-4" aria-hidden="true" />
                                </button>
                            }
                            items={table
                                .getAllColumns()
                                .filter((column) => column.getCanHide())
                                .map((column) => ({
                                    label: column.id.charAt(0).toUpperCase() + column.id.slice(1),
                                    onClick: () => column.toggleVisibility(!column.getIsVisible()),
                                    closeOnClick: false,
                                    checked: column.getIsVisible(),
                                }))}
                        />
                    </div>
                )}
            </div>

            {enableRowSelection && selectedRowsCount > 0 && (
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/40">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {selectedRowsCount} row(s) selected
                    </span>
                    <button
                        type="button"
                        onClick={() => setRowSelection({})}
                        aria-label="Clear row selection"
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-1.5 text-primary-700 transition-colors hover:bg-primary-50 dark:text-slate-100 dark:hover:bg-slate-800/60"
                    >
                        <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                </div>
            )}

            <div className="md:hidden space-y-3">
                {isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" />
                    ))
                ) : error ? (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-600">{error}</p>
                ) : table.getRowModel().rows.length === 0 ? (
                    <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
                        No records found matching your search.
                    </p>
                ) : (
                    table.getRowModel().rows.map((row) => (
                        <article
                            key={row.id}
                            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                        >
                            {enableRowSelection && (
                                <div className="mb-3">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-slate-300"
                                        checked={row.getIsSelected()}
                                        disabled={!row.getCanSelect()}
                                        onChange={row.getToggleSelectedHandler()}
                                        aria-label="Select row"
                                    />
                                </div>
                            )}
                            {renderMobileCard(row)}
                        </article>
                    ))
                )}
            </div>

            <div
                className={clsx(
                    'hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 md:block',
                    className
                )}
            >
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-separate border-spacing-0">
                        <thead className={clsx('bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-100', headerClassName)}>
                            {table.getHeaderGroups().map((headerGroup) => (
                                <tr key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => {
                                        const sorted = header.column.getIsSorted();
                                        return (
                                            <th
                                                key={header.id}
                                                scope="col"
                                                aria-sort={header.column.getCanSort() ? ariaSortValue(sorted) : undefined}
                                                className="border-b border-slate-200 px-3 py-3 text-xs font-bold uppercase tracking-wider first:rounded-tl-2xl last:rounded-tr-2xl sm:px-6 sm:py-4 dark:border-slate-700"
                                            >
                                                {header.isPlaceholder ? null : header.column.getCanSort() ? (
                                                    <button
                                                        type="button"
                                                        className="flex items-center gap-2 group"
                                                        onClick={header.column.getToggleSortingHandler()}
                                                    >
                                                        {flexRender(
                                                            header.column.columnDef.header,
                                                            header.getContext()
                                                        )}
                                                        <span className="text-slate-500 transition-colors group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-slate-100" aria-hidden="true">
                                                            {sorted === 'asc' ? (
                                                                <ChevronUp className="w-3 h-3" />
                                                            ) : sorted === 'desc' ? (
                                                                <ChevronDown className="w-3 h-3" />
                                                            ) : (
                                                                <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                                                            )}
                                                        </span>
                                                    </button>
                                                ) : (
                                                    flexRender(
                                                        header.column.columnDef.header,
                                                        header.getContext()
                                                    )
                                                )}
                                            </th>
                                        );
                                    })}
                                </tr>
                            ))}
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        {columnsWithActions.map((_, j) => (
                                            <td key={j} className="px-3 py-3 sm:px-6 sm:py-4">
                                                <div className="h-4 w-3/4 rounded-md bg-slate-100 dark:bg-slate-800/60" />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : error ? (
                                <tr>
                                    <td
                                        colSpan={columnsWithActions.length}
                                        className="px-6 py-20 text-center"
                                    >
                                        <div className="flex flex-col items-center justify-center text-red-500">
                                            <X className="w-10 h-10 mb-3 opacity-20" aria-hidden="true" />
                                            <p className="text-sm font-bold italic">{error}</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : table.getRowModel().rows.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={columnsWithActions.length}
                                        className="px-6 py-20 text-center"
                                    >
                                        <div className="flex flex-col items-center justify-center text-slate-500 dark:text-slate-300">
                                            <Search className="w-10 h-10 mb-3 opacity-20" aria-hidden="true" />
                                            <p className="text-sm font-bold italic text-slate-500 dark:text-slate-300">No records found matching your search.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                table.getRowModel().rows.map((row) => (
                                    <tr
                                        key={row.id}
                                        className={clsx(
                                            'transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50',
                                            rowHoverClassName
                                        )}
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <td
                                                key={cell.id}
                                                className="px-3 py-3 text-sm text-slate-900 sm:px-6 sm:py-4 dark:text-slate-100"
                                            >
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                <div className="flex items-center gap-3">
                    <label htmlFor={pageSizeId} className="text-sm font-medium text-slate-500 dark:text-slate-300">
                        Show
                    </label>
                    <select
                        id={pageSizeId}
                        value={table.getState().pagination.pageSize}
                        onChange={(e) => table.setPageSize(Number(e.target.value))}
                        aria-label="Rows per page"
                        className="min-h-11 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                        {[10, 25, 50, 100].map((pageSize) => (
                            <option key={pageSize} value={pageSize}>
                                {pageSize}
                            </option>
                        ))}
                    </select>
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-300">
                        records
                    </span>
                </div>

                <div className="flex items-center gap-6">
                    <span className="text-sm font-bold text-slate-500 dark:text-slate-300">
                        Page <span className="text-slate-900 dark:text-slate-100">{table.getState().pagination.pageIndex + 1}</span> of{' '}
                        <span className="text-slate-900 dark:text-slate-100">{Math.max(table.getPageCount(), 1)}</span>
                    </span>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => table.previousPage()}
                            disabled={!table.getCanPreviousPage()}
                            aria-label="Previous page"
                            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800/60"
                        >
                            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={() => table.nextPage()}
                            disabled={!table.getCanNextPage()}
                            aria-label="Next page"
                            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800/60"
                        >
                            <ChevronRight className="w-5 h-5" aria-hidden="true" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
