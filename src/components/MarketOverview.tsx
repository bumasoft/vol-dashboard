import { useState, useEffect, useRef, useCallback } from 'react';
import { getMarketStatus, streamBatchCalculation } from '../services/tasty';
import type { AssetGroups, BatchProgressEvent, SkewResult } from '../services/tasty';
import { AssetGroup } from './AssetGroup';
import type { AssetState, AssetStatus } from './AssetCard';

type GroupKey = 'fx' | 'indices' | 'bonds' | 'crypto';

interface MarketOverviewProps {
    serverOnline: boolean | null;
    onShowChart: (symbol: string) => void;
}

export function MarketOverview({ serverOnline, onShowChart }: MarketOverviewProps) {
    const [groups, setGroups] = useState<AssetGroups | null>(null);
    const [descriptions, setDescriptions] = useState<Record<string, string>>({});
    const [assetStates, setAssetStates] = useState<Record<string, AssetState>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [calculatingSymbols, setCalculatingSymbols] = useState<Set<string>>(new Set());
    const cleanupRef = useRef<(() => void) | null>(null);
    const initialLoadDoneRef = useRef(false);

    // Check if a group is refreshing based on its symbols' states
    const isGroupRefreshing = useCallback((groupSymbols: readonly string[]) => {
        return groupSymbols.some(symbol => calculatingSymbols.has(symbol));
    }, [calculatingSymbols]);

    const isAnyRefreshing = calculatingSymbols.size > 0;

    // Update a single asset's state
    const updateAssetState = useCallback((symbol: string, update: Partial<AssetState>) => {
        setAssetStates(prev => ({
            ...prev,
            [symbol]: { ...prev[symbol], ...update }
        }));
    }, []);

    // Handle batch progress events
    const handleBatchProgress = useCallback((event: BatchProgressEvent) => {
        if (event.type === 'progress' && event.symbol) {
            const status = event.status as AssetStatus;
            if (status === 'complete' || status === 'cached') {
                updateAssetState(event.symbol, {
                    status,
                    result: event.data as SkewResult,
                    error: undefined
                });
                // Remove from calculating set
                setCalculatingSymbols(prev => {
                    const next = new Set(prev);
                    next.delete(event.symbol!);
                    return next;
                });
            } else if (status === 'error') {
                updateAssetState(event.symbol, {
                    status: 'error',
                    error: event.data?.error || 'Unknown error'
                });
                // Remove from calculating set
                setCalculatingSymbols(prev => {
                    const next = new Set(prev);
                    next.delete(event.symbol!);
                    return next;
                });
            } else {
                updateAssetState(event.symbol, { status });
            }
        }
    }, [updateAssetState]);

    // Start batch calculation for specific symbols
    const startBatchCalculation = useCallback((
        symbols: string[]
    ) => {
        // Cleanup previous stream if any
        if (cleanupRef.current) {
            cleanupRef.current();
            cleanupRef.current = null;
        }

        // Set all symbols to pending and add to calculating set
        symbols.forEach(symbol => {
            updateAssetState(symbol, { status: 'pending' });
        });
        setCalculatingSymbols(prev => new Set([...prev, ...symbols]));

        cleanupRef.current = streamBatchCalculation(
            { symbols },
            handleBatchProgress,
            () => {
                cleanupRef.current = null;
            },
            (error) => {
                console.error('Batch calculation error:', error);
                // Remove all symbols from calculating on error
                setCalculatingSymbols(prev => {
                    const next = new Set(prev);
                    symbols.forEach(s => next.delete(s));
                    return next;
                });
                cleanupRef.current = null;
            }
        );
    }, [handleBatchProgress, updateAssetState]);

    // Refresh a specific group
    const refreshGroup = useCallback((groupKey: GroupKey) => {
        if (!groups) return;
        const symbols = [...groups[groupKey].symbols];
        startBatchCalculation(symbols);
    }, [groups, startBatchCalculation]);

    // Refresh all groups
    const refreshAll = useCallback(() => {
        if (!groups) return;
        const allSymbols = Object.values(groups).flatMap(g => [...g.symbols]);
        startBatchCalculation(allSymbols);
    }, [groups, startBatchCalculation]);

    // Retry a single symbol
    const retrySymbol = useCallback((symbol: string) => {
        startBatchCalculation([symbol]);
    }, [startBatchCalculation]);

    // Initial load - fetch market status
    useEffect(() => {
        // Prevent duplicate initial loads (React StrictMode / effect re-runs)
        if (initialLoadDoneRef.current) return;

        const loadMarketStatus = async () => {
            try {
                setIsLoading(true);
                setError(null);

                const response = await getMarketStatus();
                setGroups(response.groups);
                setDescriptions(response.descriptions);

                // Set initial states from cached data
                const initialStates: Record<string, AssetState> = {};
                const uncachedSymbols: string[] = [];

                for (const [symbol, { cached, data }] of Object.entries(response.status)) {
                    if (cached && data) {
                        initialStates[symbol] = {
                            status: 'cached',
                            result: data
                        };
                    } else {
                        initialStates[symbol] = { status: 'idle' };
                        uncachedSymbols.push(symbol);
                    }
                }

                setAssetStates(initialStates);
                setIsLoading(false);

                // Auto-calculate uncached symbols
                if (uncachedSymbols.length > 0) {
                    // Small delay to let UI render first
                    setTimeout(() => {
                        startBatchCalculation(uncachedSymbols);
                    }, 100);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load market status');
                setIsLoading(false);
            }
        };

        if (serverOnline) {
            initialLoadDoneRef.current = true;
            loadMarketStatus();
        }

        return () => {
            if (cleanupRef.current) {
                cleanupRef.current();
            }
        };
    }, [serverOnline, startBatchCalculation]);

    if (serverOnline === false) {
        return (
            <div className="market-overview">
                <div className="market-overview__error">
                    Server is offline. Please check your connection.
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="market-overview">
                <div className="market-overview__loading">
                    Loading market data...
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="market-overview">
                <div className="market-overview__error">
                    {error}
                </div>
            </div>
        );
    }

    if (!groups) {
        return null;
    }

    return (
        <div className="market-overview">
            <div className="market-overview__header">
                <h1 className="market-overview__title">Market Overview</h1>
                <button
                    className="btn-gradient market-overview__refresh-all"
                    onClick={refreshAll}
                    disabled={isAnyRefreshing}
                >
                    {isAnyRefreshing ? (
                        <>
                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span>Refreshing...</span>
                        </>
                    ) : (
                        'Refresh All'
                    )}
                </button>
            </div>

            <div className="market-overview__groups">
                {(Object.entries(groups) as [GroupKey, typeof groups.fx][]).map(([key, group]) => (
                    <AssetGroup
                        key={key}
                        name={group.name}
                        symbols={group.symbols}
                        descriptions={descriptions}
                        states={assetStates}
                        onRefresh={() => refreshGroup(key)}
                        onRetrySymbol={retrySymbol}
                        onShowChart={onShowChart}
                        isRefreshing={isGroupRefreshing(group.symbols)}
                    />
                ))}
            </div>
        </div>
    );
}
