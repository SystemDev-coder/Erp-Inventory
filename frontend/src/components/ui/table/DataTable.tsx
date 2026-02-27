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
                                className="rounded-lg p-2 text-[#57748c] transition-colors hover:bg-[#eaf5fb] hover:text-[#0f4f76] dark:text-[#cfe3f1] dark:hover:bg-[#1b5a80]/35 dark:hover:text-[#e7f2fb]"
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
                                className="rounded-lg p-2 text-[#57748c] transition-colors hover:bg-[#eaf5fb] hover:text-[#0f4f76] dark:text-[#cfe3f1] dark:hover:bg-[#1b5a80]/35 dark:hover:text-[#e7f2fb]"
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
                                className="rounded-lg p-2 text-[#57748c] transition-colors hover:bg-[#feecee] hover:text-[#dc2626] dark:text-[#cfe3f1] dark:hover:bg-[#7f1d1d]/35 dark:hover:text-[#fecaca]"
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
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7f9fb8] dark:text-[#9fc3da]" />
                    <input
                        type="text"
                        placeholder={searchPlaceholder}
                        value={globalFilter ?? ''}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                        className="w-full rounded-xl border border-[#b7cde0] bg-white py-2.5 pl-10 pr-4 text-sm text-[#12344c] shadow-sm transition-all hover:border-[#9ec5df] focus:border-[#0f4f76] focus:outline-none focus:ring-2 focus:ring-[#0f4f76]/25 dark:border-[#2c6287] dark:bg-[#12344c] dark:text-[#e7f2fb] dark:hover:border-[#4b7ea2] dark:placeholder:text-[#9fc3da]"
                    />
                </div>

                {/* Actions (column visibility only; Print/Export removed) */}
                {showToolbarActions && enableColumnVisibility && (
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <ActionDropdown
                            trigger={
                                <button className="rounded-xl border border-[#b7cde0] bg-white p-2 text-[#57748c] transition-colors hover:bg-[#edf5fb] hover:text-[#123f5c] dark:border-[#2c6287] dark:bg-[#12344c] dark:text-[#cfe3f1] dark:hover:bg-[#1b5a80]/35">
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
                <div className="flex items-center justify-between rounded-lg border border-[#b7cde0] bg-[#eaf5fb] px-4 py-3 dark:border-[#2c6287] dark:bg-[#1b5a80]/30">
                    <span className="text-sm font-medium text-[#123f5c] dark:text-[#e7f2fb]">
                        {selectedRowsCount} row(s) selected
                    </span>
                    <div className="flex items-center gap-2">
                        <button className="rounded-lg px-3 py-1.5 text-sm font-medium text-[#0f4f76] transition-colors hover:bg-[#d6eaf6] dark:text-[#e7f2fb] dark:hover:bg-[#1b5a80]/40">
                            Bulk Action
                        </button>
                        <button
                            onClick={() => setRowSelection({})}
                            className="rounded-lg p-1.5 text-[#0f4f76] transition-colors hover:bg-[#d6eaf6] dark:text-[#e7f2fb] dark:hover:bg-[#1b5a80]/40"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Table */}
            <div
                className={clsx(
                    'overflow-hidden rounded-2xl border border-[#b7cde0] bg-white shadow-sm dark:border-[#2c6287] dark:bg-[#12344c]',
                    className
                )}
            >
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-separate border-spacing-0">
                        <thead className={clsx('bg-[#edf5fb] text-[#123f5c] dark:bg-[#0f4f76]/40 dark:text-[#e7f2fb]', headerClassName)}>
                            {table.getHeaderGroups().map((headerGroup) => (
                                <tr key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => (
                                        <th
                                            key={header.id}
                                            className="border-b border-[#d0dfeb] px-6 py-4 text-xs font-bold uppercase tracking-wider first:rounded-tl-2xl last:rounded-tr-2xl dark:border-[#2c6287]"
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
                                                        <span className="text-[#7f9fb8] transition-colors group-hover:text-[#123f5c] dark:text-[#9fc3da] dark:group-hover:text-[#e7f2fb]">
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
                        <tbody className="divide-y divide-[#dce8f2] dark:divide-[#2c6287]">
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        {columnsWithActions.map((_, j) => (
                                            <td key={j} className="px-6 py-4">
                                                <div className="h-4 w-3/4 rounded-md bg-[#d6e6f2] dark:bg-[#1b5a80]" />
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
                                        <div className="flex flex-col items-center justify-center text-[#57748c] dark:text-[#9fc3da]">
                                            <Search className="w-10 h-10 mb-3 opacity-20" />
                                            <p className="text-sm font-bold italic text-[#57748c] dark:text-[#9fc3da]">No records found matching your search.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                table.getRowModel().rows.map((row) => (
                                    <tr
                                        key={row.id}
                                            className={clsx(
                                            'transition-colors hover:bg-[#edf5fb] dark:hover:bg-[#1b5a80]/30',
                                            rowHoverClassName
                                        )}
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <td
                                                key={cell.id}
                                                className="px-6 py-4 text-sm text-[#12344c] dark:text-[#e7f2fb]"
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
                    <span className="text-sm font-medium text-[#57748c] dark:text-[#9fc3da]">
                        Show
                    </span>
                    <select
                        value={table.getState().pagination.pageSize}
                        onChange={(e) => table.setPageSize(Number(e.target.value))}
                        className="rounded-lg border border-[#b7cde0] bg-white px-2 py-1.5 text-sm font-bold text-[#123f5c] focus:outline-none focus:ring-2 focus:ring-[#0f4f76]/30 dark:border-[#2c6287] dark:bg-[#12344c] dark:text-[#e7f2fb]"
                    >
                        {[10, 25, 50, 100].map((pageSize) => (
                            <option key={pageSize} value={pageSize}>
                                {pageSize}
                            </option>
                        ))}
                    </select>
                    <span className="text-sm font-medium text-[#57748c] dark:text-[#9fc3da]">
                        records
                    </span>
                </div>

                <div className="flex items-center gap-6">
                    <span className="text-sm font-bold text-[#57748c] dark:text-[#9fc3da]">
                        Page <span className="text-[#123f5c] dark:text-[#e7f2fb]">{table.getState().pagination.pageIndex + 1}</span> of{' '}
                        <span className="text-[#123f5c] dark:text-[#e7f2fb]">{table.getPageCount()}</span>
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => table.previousPage()}
                            disabled={!table.getCanPreviousPage()}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#b7cde0] bg-white text-[#123f5c] transition-all hover:bg-[#edf5fb] disabled:cursor-not-allowed disabled:opacity-30 dark:border-[#2c6287] dark:bg-[#12344c] dark:text-[#e7f2fb] dark:hover:bg-[#1b5a80]/35"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => table.nextPage()}
                            disabled={!table.getCanNextPage()}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#b7cde0] bg-white text-[#123f5c] transition-all hover:bg-[#edf5fb] disabled:cursor-not-allowed disabled:opacity-30 dark:border-[#2c6287] dark:bg-[#12344c] dark:text-[#e7f2fb] dark:hover:bg-[#1b5a80]/35"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
