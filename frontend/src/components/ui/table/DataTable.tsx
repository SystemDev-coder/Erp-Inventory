import { useState, useMemo } from 'react';
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
    Download,
    Printer,
    Settings2,
    MoreVertical,
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
    columns: ColumnDef<TData, any>[];
    searchPlaceholder?: string;
    onView?: (row: TData) => void;
    onEdit?: (row: TData) => void;
    onDelete?: (row: TData) => void;
    enableRowSelection?: boolean;
    enableColumnVisibility?: boolean;
    isLoading?: boolean;
    error?: string | null;
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
}: DataTableProps<TData>) {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
    const [rowSelection, setRowSelection] = useState({});
    const [globalFilter, setGlobalFilter] = useState('');

    // Add actions column if handlers are provided
    const columnsWithActions = useMemo(() => {
        if (!onView && !onEdit && !onDelete) return columns;

        const actionsColumn: ColumnDef<TData, any> = {
            id: 'actions',
            header: 'Actions',
            cell: ({ row }) => {
                const items = [];

                if (onView) {
                    items.push({
                        label: 'View',
                        icon: <Eye className="w-4 h-4" />,
                        onClick: () => onView(row.original),
                    });
                }

                if (onEdit) {
                    items.push({
                        label: 'Edit',
                        icon: <Edit className="w-4 h-4" />,
                        onClick: () => onEdit(row.original),
                    });
                }

                if (onDelete) {
                    if (items.length > 0) {
                        items.push({ label: '', onClick: () => { }, divider: true });
                    }
                    items.push({
                        label: 'Delete',
                        icon: <Trash2 className="w-4 h-4" />,
                        onClick: () => onDelete(row.original),
                        variant: 'danger' as const,
                    });
                }

                return (
                    <ActionDropdown
                        trigger={
                            <button className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
                                <MoreVertical className="w-4 h-4" />
                            </button>
                        }
                        items={items}
                        align="right"
                    />
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
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder={searchPlaceholder}
                        value={globalFilter ?? ''}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 transition-all shadow-sm hover:border-slate-300"
                    />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                        onClick={() => window.print()}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-xl transition-colors border border-slate-200 dark:border-slate-700"
                        title="Print"
                    >
                        <Printer className="w-4 h-4" />
                        <span className="hidden sm:inline">Print</span>
                    </button>

                    <button
                        onClick={() => {
                            // Basic CSV export logic
                            console.log('Exporting data as CSV...');
                        }}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-xl transition-colors border border-slate-200 dark:border-slate-700"
                        title="Export CSV"
                    >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">Export</span>
                    </button>

                    {enableColumnVisibility && (
                        <ActionDropdown
                            trigger={
                                <button className="p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-xl transition-colors border border-slate-200 dark:border-slate-700">
                                    <Settings2 className="w-4 h-4" />
                                </button>
                            }
                            items={table
                                .getAllColumns()
                                .filter((column) => column.getCanHide())
                                .map((column) => ({
                                    label: column.id.charAt(0).toUpperCase() + column.id.slice(1),
                                    onClick: () => column.toggleVisibility(!column.getIsVisible()),
                                }))}
                        />
                    )}
                </div>
            </div>

            {/* Bulk Actions Bar */}
            {selectedRowsCount > 0 && (
                <div className="flex items-center justify-between px-4 py-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
                    <span className="text-sm font-medium text-primary-900 dark:text-primary-100">
                        {selectedRowsCount} row(s) selected
                    </span>
                    <div className="flex items-center gap-2">
                        <button className="px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-100 dark:text-primary-300 dark:hover:bg-primary-900/40 rounded-lg transition-colors">
                            Bulk Action
                        </button>
                        <button
                            onClick={() => setRowSelection({})}
                            className="p-1.5 text-primary-600 hover:bg-primary-100 dark:text-primary-400 dark:hover:bg-primary-900/40 rounded-lg transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 dark:bg-slate-800/50">
                            {table.getHeaderGroups().map((headerGroup) => (
                                <tr key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => (
                                        <th
                                            key={header.id}
                                            className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider dark:text-slate-400 border-b border-slate-200 dark:border-slate-800"
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
                                                        <span className="text-slate-400 group-hover:text-slate-600 transition-colors">
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
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        {columnsWithActions.map((_, j) => (
                                            <td key={j} className="px-6 py-4">
                                                <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-md w-3/4"></div>
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
                                        <div className="flex flex-col items-center justify-center text-slate-400">
                                            <Search className="w-10 h-10 mb-3 opacity-20" />
                                            <p className="text-sm font-bold text-slate-400 italic">No records found matching your search.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                table.getRowModel().rows.map((row) => (
                                    <tr
                                        key={row.id}
                                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors"
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <td
                                                key={cell.id}
                                                className="px-6 py-4 text-sm text-slate-700 dark:text-slate-300"
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
                    <span className="text-sm font-medium text-slate-500">
                        Show
                    </span>
                    <select
                        value={table.getState().pagination.pageSize}
                        onChange={(e) => table.setPageSize(Number(e.target.value))}
                        className="px-2 py-1.5 text-sm font-bold border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                    >
                        {[10, 25, 50, 100].map((pageSize) => (
                            <option key={pageSize} value={pageSize}>
                                {pageSize}
                            </option>
                        ))}
                    </select>
                    <span className="text-sm font-medium text-slate-500">
                        records
                    </span>
                </div>

                <div className="flex items-center gap-6">
                    <span className="text-sm font-bold text-slate-500">
                        Page <span className="text-slate-900 dark:text-slate-100">{table.getState().pagination.pageIndex + 1}</span> of{' '}
                        <span className="text-slate-900 dark:text-slate-100">{table.getPageCount()}</span>
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => table.previousPage()}
                            disabled={!table.getCanPreviousPage()}
                            className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => table.nextPage()}
                            disabled={!table.getCanNextPage()}
                            className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
