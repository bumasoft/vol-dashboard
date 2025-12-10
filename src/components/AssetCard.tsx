import type { SkewResult } from '../services/tasty';

export type AssetStatus = 'idle' | 'pending' | 'calculating' | 'phase1' | 'phase2' | 'cached' | 'complete' | 'error';

export interface AssetState {
    status: AssetStatus;
    result?: SkewResult;
    error?: string;
}

interface AssetCardProps {
    symbol: string;
    description?: string;
    state: AssetState;
    onRetry?: () => void;
}

const getSkewColor = (skew: number): string => {
    if (skew < 0.7) return '#22c55e';  // Green - Bullish
    if (skew < 1.0) return '#facc15';  // Yellow - Neutral
    if (skew < 1.3) return '#f97316';  // Orange - Mildly Bearish
    return '#ef4444';                   // Red - Bearish
};

const getPricingSkewColor = (skew: number | null): string => {
    if (skew === null) return 'rgba(255, 255, 255, 0.4)';
    if (skew < 0.7) return '#22c55e';  // Green - Calls expensive (Bullish)
    if (skew < 1.0) return '#facc15';  // Yellow - Neutral
    if (skew < 1.3) return '#f97316';  // Orange - Puts slightly expensive
    return '#ef4444';                   // Red - Puts expensive (Bearish)
};

const getSentiment = (skew: number): string => {
    if (skew < 0.7) return 'Bullish';
    if (skew < 1.0) return 'Neutral';
    if (skew < 1.3) return 'Sl. Bearish';
    return 'Bearish';
};

const getStatusText = (status: AssetStatus): string => {
    switch (status) {
        case 'idle': return 'Not calculated';
        case 'pending': return 'Queued...';
        case 'calculating': return 'Starting...';
        case 'phase1': return 'Collecting deltas...';
        case 'phase2': return 'Collecting OI...';
        case 'cached': return 'From cache';
        case 'complete': return '';
        case 'error': return 'Error';
        default: return '';
    }
};

export function AssetCard({ symbol, description, state, onRetry }: AssetCardProps) {
    const { status, result, error } = state;
    const isLoading = ['pending', 'calculating', 'phase1', 'phase2'].includes(status);
    const isComplete = status === 'complete' || status === 'cached';
    const isError = status === 'error';

    return (
        <div className={`asset-card ${isLoading ? 'asset-card--loading' : ''} ${isError ? 'asset-card--error' : ''}`}>
            {/* Symbol and Description */}
            <div className="asset-card__header">
                <div className="asset-card__symbol">{symbol}</div>
                {description && <div className="asset-card__description">{description}</div>}
            </div>

            {/* Content based on state */}
            {isComplete && result ? (
                <>
                    <div
                        className="asset-card__skew-row"
                        title="OI Skew: Put Open Interest / Call Open Interest (10-30 delta options)"
                    >
                        <span className="asset-card__skew-label">OI</span>
                        <span
                            className="asset-card__skew-value"
                            style={{ color: getSkewColor(result.skew) }}
                        >
                            {result.skew.toFixed(4)}
                        </span>
                    </div>
                    <div
                        className="asset-card__skew-row"
                        title="Price Skew: Avg Put Mid Price / Avg Call Mid Price (10-30 delta options)"
                    >
                        <span className="asset-card__skew-label">Price</span>
                        <span
                            className="asset-card__skew-value"
                            style={{ color: getPricingSkewColor(result.pricingSkew) }}
                        >
                            {result.pricingSkew !== null ? result.pricingSkew.toFixed(4) : 'N/A'}
                        </span>
                    </div>
                    <div
                        className="asset-card__skew-row"
                        title={(() => {
                            if (result.impliedMove === null || result.underlyingPrice === null) {
                                return 'Implied Move: Expected price range by expiration (ATM straddle / underlying price)';
                            }
                            const decimals = symbol.startsWith('/6') ? 4 : 2;
                            const lower = (result.underlyingPrice * (1 - result.impliedMove / 100)).toFixed(decimals);
                            const upper = (result.underlyingPrice * (1 + result.impliedMove / 100)).toFixed(decimals);
                            return `Implied Move: ±${result.impliedMove.toFixed(2)}% | Range: ${lower} - ${upper}`;
                        })()}
                    >
                        <span className="asset-card__skew-label">Move</span>
                        <span className="asset-card__skew-value asset-card__implied-move">
                            {result.impliedMove !== null ? `±${result.impliedMove.toFixed(2)}%` : 'N/A'}
                        </span>
                    </div>
                    <div
                        className="asset-card__sentiment"
                        style={{ color: getSkewColor(
                            result.pricingSkew !== null
                                ? (result.skew + result.pricingSkew) / 2
                                : result.skew
                        ) }}
                        title="Based on average of OI and Price skew"
                    >
                        {getSentiment(
                            result.pricingSkew !== null
                                ? (result.skew + result.pricingSkew) / 2
                                : result.skew
                        )}
                    </div>
                    <div className="asset-card__dte">
                        DTE: {result.dte}
                    </div>
                </>
            ) : isError ? (
                <div className="asset-card__error-container">
                    <div className="asset-card__error-msg">
                        {error?.includes('Timeout') ? 'No OI Data' : 'Failed'}
                    </div>
                    {onRetry && (
                        <button className="asset-card__retry-btn" onClick={onRetry}>
                            Retry
                        </button>
                    )}
                </div>
            ) : isLoading ? (
                <div className="asset-card__loading">
                    <div className="asset-card__spinner" />
                    <span>{getStatusText(status)}</span>
                </div>
            ) : (
                <div className="asset-card__idle">
                    {getStatusText(status)}
                </div>
            )}
        </div>
    );
}
