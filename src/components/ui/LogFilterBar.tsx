import React from 'react';
import { NeonButton } from './NeonButton';
import { Search, ArrowUp, ArrowDown } from 'lucide-react';

interface LogFilterBarProps {
    title: string;
    count: number;
    countLabel?: string;

    // Search
    search: string;
    onSearchChange: (value: string) => void;
    searchPlaceholder?: string;

    // Date Filtering
    dateFrom: string;
    onDateFromChange: (value: string) => void;
    dateTo: string;
    onDateToChange: (value: string) => void;

    // Sorting
    sortAscending: boolean;
    onSortChange: () => void;

    // Pagination Controls
    pageSize?: number;
    onPageSizeChange?: (size: number) => void;

    // Refresh
    onRefresh: () => void;
    refreshing: boolean;

    // Extra filters slot
    children?: React.ReactNode;
}

export const LogFilterBar: React.FC<LogFilterBarProps> = ({
    title,
    count,
    countLabel = 'entries',
    search,
    onSearchChange,
    searchPlaceholder = 'Search...',
    dateFrom,
    onDateFromChange,
    dateTo,
    onDateToChange,
    sortAscending,
    onSortChange,
    pageSize,
    onPageSizeChange,
    onRefresh,
    refreshing,
    children
}) => {
    return (
        <div style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
        }}>
            {/* Top Row: Title & Right Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: 'var(--color-text-main)',
                    margin: 0
                }}>
                    {title} ({count} {countLabel})
                </h3>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {/* Page Size Selector (Optional) */}
                    {pageSize && onPageSizeChange && count > 10 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '0.5rem' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>Rows:</span>
                            <select
                                value={pageSize}
                                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                                style={{
                                    background: 'var(--color-surface-card)',
                                    border: '1px solid var(--border-color)',
                                    color: 'var(--color-text-main)',
                                    borderRadius: 'var(--border-radius)',
                                    padding: '0.2rem 0.5rem',
                                    fontSize: '0.75rem',
                                    outline: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </div>
                    )}

                    {/* Sort Toggle */}
                    <button
                        onClick={onSortChange}
                        title={sortAscending ? "Sort Newest First" : "Sort Oldest First"}
                        style={{
                            background: 'transparent',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--border-radius)',
                            color: 'var(--color-text-dim)',
                            padding: '0.25rem 0.5rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.75rem',
                            height: '28px'
                        }}
                    >
                        {sortAscending ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                        {sortAscending ? 'Oldest' : 'Newest'}
                    </button>

                    {/* Refresh Button (Matches LocationsView) */}
                    <NeonButton
                        variant="ghost"
                        size="sm"
                        onClick={onRefresh}
                        disabled={refreshing}
                        style={{ height: '28px' }}
                    >
                        {refreshing ? 'Refreshing...' : 'Refresh'}
                    </NeonButton>
                </div>
            </div>

            {/* Filters Row */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Search */}
                <div style={{ position: 'relative', flex: 1, minWidth: '150px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-dim)' }} />
                    <input
                        type="text"
                        placeholder={searchPlaceholder}
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem 0.5rem 2rem',
                            borderRadius: 'var(--border-radius)',
                            border: '1px solid var(--border-color)',
                            background: 'var(--color-surface-card)',
                            color: 'var(--color-text-main)',
                            fontSize: '0.8rem',
                            outline: 'none'
                        }}
                    />
                </div>

                {/* Date Standard Range Pickers */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ position: 'relative' }}>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => onDateFromChange(e.target.value)}
                            style={{
                                background: 'var(--color-surface-card)',
                                border: '1px solid var(--border-color)',
                                color: 'var(--color-text-dim)',
                                borderRadius: 'var(--border-radius)',
                                padding: '0.4rem 0.5rem',
                                fontSize: '0.75rem',
                                outline: 'none',
                                cursor: 'pointer',
                                fontFamily: 'inherit'
                            }}
                            title="From Date"
                        />
                    </div>
                    <span style={{ color: 'var(--color-text-dim)', fontSize: '0.8rem' }}>to</span>
                    <div style={{ position: 'relative' }}>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => onDateToChange(e.target.value)}
                            style={{
                                background: 'var(--color-surface-card)',
                                border: '1px solid var(--border-color)',
                                color: 'var(--color-text-dim)',
                                borderRadius: 'var(--border-radius)',
                                padding: '0.4rem 0.5rem',
                                fontSize: '0.75rem',
                                outline: 'none',
                                cursor: 'pointer',
                                fontFamily: 'inherit'
                            }}
                            title="To Date"
                        />
                    </div>
                </div>

                {/* Custom Children (View Specific Filters) */}
                {children}
            </div>
        </div>
    );
};
