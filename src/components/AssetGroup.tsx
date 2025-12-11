import { AssetCard, type AssetState } from './AssetCard';

interface AssetGroupProps {
    name: string;
    symbols: readonly string[];
    descriptions: Record<string, string>;
    states: Record<string, AssetState>;
    onRefresh: () => void;
    onRetrySymbol: (symbol: string) => void;
    onShowChart: (symbol: string) => void;
    isRefreshing: boolean;
}

export function AssetGroup({ name, symbols, descriptions, states, onRefresh, onRetrySymbol, onShowChart, isRefreshing }: AssetGroupProps) {
    return (
        <div className="asset-group">
            <div className="asset-group__header">
                <h2 className="asset-group__name">{name}</h2>
                <button
                    className="asset-group__refresh-btn"
                    onClick={onRefresh}
                    disabled={isRefreshing}
                >
                    {isRefreshing ? (
                        <>
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span>Refreshing...</span>
                        </>
                    ) : (
                        <>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            <span>Refresh</span>
                        </>
                    )}
                </button>
            </div>
            <div className="asset-group__grid">
                {symbols.map(symbol => (
                    <AssetCard
                        key={symbol}
                        symbol={symbol}
                        description={descriptions[symbol]}
                        state={states[symbol] || { status: 'idle' }}
                        onRetry={() => onRetrySymbol(symbol)}
                        onShowChart={() => onShowChart(symbol)}
                    />
                ))}
            </div>
        </div>
    );
}
