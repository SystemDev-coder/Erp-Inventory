import { useState, useMemo } from 'react';
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

interface DataTableProps<TData> {
    data: TData[];
    columns: ColumnDef<TData, unknown>[];
    searchPlaceholder?: string;
    onView?: (row: TData) => void;
    onEdit?: (row: TData) => void;
    onDelete?: (row: TData) => void;
    enableRowSelection?: boolean;
    enableColumnVisibility?: boolean;
    isLoading?: boolean;
    error?: string | null;
    showToolbarActions?: boolean;
    className?: string;
    headerClassName?: string;
    rowHoverClassName?: string;
}

export function DataTable<TData>({
    data,
    columns,
    searchPlaceholder = 'Search...',
    onView,
    onEdit,
    onDelete,
    enableRowSelection = true,
    enableColumnVisibility = true,
    isLoading = false,
    error = null,
    showToolbarActions = true,
    className,
    headerClassName,
    rowHoverClassName,
}: DataTableProps<TData>) {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
    const [rowSelection, setRowSelection] = useState({});
    const [globalFilter, setGlobalFilter] = useState('');

    // Add actions column if handlers are provided
    const columnsWithActions = useMemo(() => {
        if (!onView && !onEdit && !onDelete) return columns;

        const actionsColumn: ColumnDef<TData, unknown> = {
            id: 'actions',
            header: 'Actions',
            cell: ({ row }) => {
                return (
                    <div className="flex items-center gap-2">
                        {onView && (
                            <button
                                onClick={() => onView(row.original)}
                                className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-primary-50 hover:text-primary-600 dark:text-slate-300 dark:hover:bg-primary-500/20 dark:hover:text-primary-300"
                                title="View"
                            >
                                <Eye className="w-4 h-4" />
                            </button>
                        )}
                        {onEdit && (
                            <button
                                onClick={() => {
                                    console.log('Edit clicked:', row.original);
                                    onEdit(row.original);
                                }}
                                className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:text-slate-300 dark:hover:bg-blue-500/20 dark:hover:text-blue-300"
                                title="Edit"
                            >
                                <Edit className="w-4 h-4" />
                            </button>
                        )}
                        {onDelete && (
                            <button
                                onClick={() => {
                                    console.log('Delete clicked:', row.original);
                                    onDelete(row.original);
                                }}
                                className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-300 dark:hover:bg-red-500/20 dark:hover:text-red-300"
                                title="Delete"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                );
            },
        };

        return [...columns, actionsColumn];
    }, [columns, onView, onEdit, onDelete]);

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
        enableRowSelection: enableRowSelection,
    });

    const selectedRowsCount = Object.keys(rowSelection).length;

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Search */}
                <div className="relative w-full sm:max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <input
                        type="text"
                        placeholder={searchPlaceholder}
                        value={globalFilter ?? ''}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-700 shadow-sm transition-all hover:border-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-600 dark:placeholder:text-slate-400"
                    />
                </div>

                {/* Actions (column visibility only; Print/Export removed) */}
                {showToolbarActions && enableColumnVisibility && (
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <ActionDropdown
                            trigger={
                                <button className="rounded-xl border border-slate-300 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                                    <Settings2 className="w-4 h-4" />
                                </button>
                            }
                            items={table
                                .getAllColumns()
                                .filter((column) => column.getCanHide())
                                .map((column) => ({
                                    label: column.id.charAt(0).toUpperCase() + column.id.slice(1),
                                    onClick: () => column.toggleVisibility(!column.getIsVisible()),
                                }))} />
                    </div>
                )}
            </div>

            {/* Bulk Actions Bar */}
            {selectedRowsCount > 0 && (
                <div className="flex items-center justify-between rounded-lg border border-primary-200 bg-primary-50 px-4 py-3 dark:border-primary-500/40 dark:bg-primary-500/15">
                    <span className="text-sm font-medium text-primary-900 dark:text-primary-200">
                        {selectedRowsCount} row(s) selected
                    </span>
                    <div className="flex items-center gap-2">
                        <button className="rounded-lg px-3 py-1.5 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-100 dark:text-primary-200 dark:hover:bg-primary-500/20">
                            Bulk Action
                        </button>
                        <button
                            onClick={() => setRowSelection({})}
                            className="rounded-lg p-1.5 text-primary-600 transition-colors hover:bg-primary-100 dark:text-primary-200 dark:hover:bg-primary-500/20"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Table */}
            <div
                className={clsx(
                    'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900',
                    className
                )}
            >
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-separate border-spacing-0">
                        <thead className={clsx('bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-200', headerClassName)}>
                            {table.getHeaderGroups().map((headerGroup) => (
                                <tr key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => (
                                        <th
                                            key={header.id}
                                            className="border-b border-slate-200 px-6 py-4 text-xs font-bold uppercase tracking-wider first:rounded-tl-2xl last:rounded-tr-2xl dark:border-slate-700"
                                        >
                                            {header.isPlaceholder ? null : (
                                                <div
                                                    className={`flex items-center gap-2 ${header.column.getCanSort() ? 'cursor-pointer select-none group' : ''
                                                        }`}
                                                    onClick={header.column.getToggleSortingHandler()}
                                                >
                                                    {flexRender(
                                                        header.column.columnDef.header,
                                                        header.getContext()
                                                    )}
                                                    {header.column.getCanSort() && (
                                                        <span className="text-slate-400 transition-colors group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300">
                                                            {header.column.getIsSorted() === 'asc' ? (
                                                                <ChevronUp className="w-3 h-3" />
                                                            ) : header.column.getIsSorted() === 'desc' ? (
                                                                <ChevronDown className="w-3 h-3" />
                                                            ) : (
                                                                <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                                                            )}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        {columnsWithActions.map((_, j) => (
                                            <td key={j} className="px-6 py-4">
                                                <div className="h-4 w-3/4 rounded-md bg-slate-200 dark:bg-slate-700" />
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
                                            <X className="w-10 h-10 mb-3 opacity-20" />
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
                                        <div className="flex flex-col items-center justify-center text-slate-500 dark:text-slate-400">
                                            <Search className="w-10 h-10 mb-3 opacity-20" />
                                            <p className="text-sm font-bold italic text-slate-500 dark:text-slate-400">No records found matching your search.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                table.getRowModel().rows.map((row) => (
                                    <tr
                                        key={row.id}
                                            className={clsx(
                                            'transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/70',
                                            rowHoverClassName
                                        )}
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <td
                                                key={cell.id}
                                                className="px-6 py-4 text-sm text-slate-700 dark:text-slate-200"
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

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                        Show
                    </span>
                    <select
                        value={table.getState().pagination.pageSize}
                        onChange={(e) => table.setPageSize(Number(e.target.value))}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                        {[10, 25, 50, 100].map((pageSize) => (
                            <option key={pageSize} value={pageSize}>
                                {pageSize}
                            </option>
                        ))}
                    </select>
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                        records
                    </span>
                </div>

                <div className="flex items-center gap-6">
                    <span className="text-sm font-bold text-slate-600 dark:text-slate-300">
                        Page <span className="text-slate-900 dark:text-white">{table.getState().pagination.pageIndex + 1}</span> of{' '}
                        <span className="text-slate-900 dark:text-white">{table.getPageCount()}</span>
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => table.previousPage()}
                            disabled={!table.getCanPreviousPage()}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => table.nextPage()}
                            disabled={!table.getCanNextPage()}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
