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
    if (skew < 0.3) return '#a855f7';  // Purple - Extreme Bullish (Contrarian)
    if (skew < 0.5) return '#22c55e';  // Green - Bullish
    if (skew < 0.7) return '#86efac';  // Light Green - Mildly Bullish
    if (skew < 1.3) return '#facc15';  // Yellow - Neutral
    if (skew < 1.5) return '#f97316';  // Orange - Mildly Bearish
    if (skew < 3.0) return '#ef4444';  // Red - Bearish
    return '#7f1d1d';                   // Dark Red - Extreme Bearish
};

const getPricingSkewColor = (skew: number | null): string => {
    if (skew === null) return 'rgba(255, 255, 255, 0.4)';
    if (skew < 0.3) return '#a855f7';  // Purple - Extreme Bullish
    if (skew < 0.5) return '#22c55e';  // Green - Bullish
    if (skew < 0.7) return '#86efac';  // Light Green - Mildly Bullish
    if (skew < 1.3) return '#facc15';  // Yellow - Neutral
    if (skew < 1.5) return '#f97316';  // Orange - Mildly Bearish
    if (skew < 3.0) return '#ef4444';  // Red - Bearish
    return '#7f1d1d';                   // Dark Red - Extreme Bearish
};

// Get combined sentiment label based on OI and Price skew
const getCombinedSentiment = (oiSkew: number, priceSkew: number | null): { label: string; color: string } => {
    // When no price skew, just use OI skew with normal thresholds
    if (priceSkew === null) {
        if (oiSkew < 0.3) return { label: 'Extr. Bullish', color: '#a855f7' };
        if (oiSkew < 0.5) return { label: 'Bullish', color: '#22c55e' };
        if (oiSkew < 0.7) return { label: 'Mildly Bullish', color: '#86efac' };
        if (oiSkew < 1.3) return { label: 'Neutral', color: '#facc15' };
        if (oiSkew < 1.5) return { label: 'Mildly Bearish', color: '#f97316' };
        if (oiSkew < 3.0) return { label: 'Bearish', color: '#ef4444' };
        return { label: 'Extr. Bearish', color: '#7f1d1d' };
    }

    // Average the skews directly.
    // Since both OI Skew and Price Skew now follow the same logic (< 1 is bullish, > 1 is bearish)
    // We can just average them.
    // Note: Previously there was "inversion" logic because OI skew < 0.5 was considered "very bullish"
    // and the math was trying to normalize it. With the new ranges, < 0.5 is simply bullish.
    // The user's new ranges are:
    // < 0.3: Extreme Bullish
    // 0.3 - 0.5: Bullish
    // 0.5 - 0.7: Mildly Bullish
    // 0.7 - 1.3: Neutral
    // 1.3 - 1.5: Mildly Bearish
    // 1.5 - 3.0: Bearish
    // > 3.0: Extreme Bearish

    const avg = (oiSkew + priceSkew) / 2;

    if (avg < 0.3) return { label: 'Extr. Bullish', color: '#a855f7' };
    if (avg < 0.5) return { label: 'Bullish', color: '#22c55e' };
    if (avg < 0.7) return { label: 'Mildly Bullish', color: '#86efac' };
    if (avg < 1.3) return { label: 'Neutral', color: '#facc15' };
    if (avg < 1.5) return { label: 'Mildly Bearish', color: '#f97316' };
    if (avg < 3.0) return { label: 'Bearish', color: '#ef4444' };
    return { label: 'Extr. Bearish', color: '#7f1d1d' };
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
                        style={{
                            color: getCombinedSentiment(result.skew, result.pricingSkew).color
                        }}
                        title="Based on average of OI and Price skew"
                    >
                        {getCombinedSentiment(result.skew, result.pricingSkew).label}
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
