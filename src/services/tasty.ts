const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export interface ChainResult {
    symbols: string[];
    expirationDate: string;
    dte: number;
}

export interface SkewResult {
    skew: number;
    pricingSkew: number | null;
    impliedMove: number | null;
    underlyingPrice: number | null;
    expirationDate: string;
    dte: number;
    callOi: number;
    putOi: number;
    callDelta: number;
    putDelta: number;
    callStreamerSymbol: string;
    putStreamerSymbol: string;
}

export interface StreamProgress {
    type: 'connected' | 'chain' | 'phase1' | 'phase2' | 'cached' | 'result' | 'error';
    message?: string;
    data?: any;
}

export interface AssetGroup {
    name: string;
    symbols: readonly string[];
}

export interface AssetGroups {
    fx: AssetGroup;
    indices: AssetGroup;
    bonds: AssetGroup;
    crypto: AssetGroup;
}

export interface MarketStatusResponse {
    groups: AssetGroups;
    descriptions: Record<string, string>;
    status: Record<string, { cached: boolean; data: SkewResult | null }>;
}

export interface BatchProgressEvent {
    type: 'connected' | 'progress' | 'complete' | 'error';
    symbol?: string;
    status?: 'pending' | 'calculating' | 'phase1' | 'phase2' | 'cached' | 'complete' | 'error';
    data?: any;
    symbols?: string[];
    total?: number;
    results?: Record<string, SkewResult>;
    errors?: Record<string, string>;
    summary?: { total: number; successful: number; failed: number };
    message?: string;
}

/**
 * Fetch option chain from backend
 */
export const fetchOptionChain = async (symbol: string): Promise<ChainResult> => {
    const response = await fetch(`${API_BASE_URL}/api/option-chain/${encodeURIComponent(symbol)}`);

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch option chain');
    }

    return response.json();
};

/**
 * Stream skew calculation using Server-Sent Events
 */
export const streamSkewCalculation = (
    symbol: string,
    onProgress: (progress: StreamProgress) => void,
    onComplete: (result: SkewResult) => void,
    onError: (error: string) => void
): (() => void) => {
    const url = `${API_BASE_URL}/api/stream-skew/${encodeURIComponent(symbol)}`;
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data) as StreamProgress;

            if (data.type === 'result') {
                onComplete(data.data as SkewResult);
                eventSource.close();
            } else if (data.type === 'error') {
                onError(data.message || 'Unknown error');
                eventSource.close();
            } else {
                onProgress(data);
            }
        } catch (e) {
            console.error('Failed to parse SSE data:', e);
        }
    };

    eventSource.onerror = () => {
        onError('Connection to server lost');
        eventSource.close();
    };

    // Return cleanup function
    return () => {
        eventSource.close();
    };
};

/**
 * Health check
 */
export const checkHealth = async (): Promise<boolean> => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/health`);
        return response.ok;
    } catch {
        return false;
    }
};

export interface SymbolSearchResult {
    symbol: string;
    description: string;
    listedMarket?: string;
    instrumentType?: string;
}

/**
 * Search for symbols matching a query
 */
export const searchSymbols = async (query: string): Promise<SymbolSearchResult[]> => {
    if (!query || query.length < 1) return [];

    try {
        const response = await fetch(`${API_BASE_URL}/api/symbols/search/${encodeURIComponent(query)}`);
        if (!response.ok) return [];
        return response.json();
    } catch {
        return [];
    }
};

/**
 * Get market status for all assets (cached/uncached)
 */
export const getMarketStatus = async (): Promise<MarketStatusResponse> => {
    const response = await fetch(`${API_BASE_URL}/api/market-status`);

    if (!response.ok) {
        throw new Error('Failed to fetch market status');
    }

    return response.json();
};

/**
 * Stream batch skew calculation using Server-Sent Events
 */
export const streamBatchCalculation = (
    options: { symbols?: string[]; group?: 'fx' | 'indices' | 'bonds' | 'crypto' },
    onProgress: (event: BatchProgressEvent) => void,
    onComplete: () => void,
    onError: (error: string) => void
): (() => void) => {
    let url = `${API_BASE_URL}/api/stream-batch`;

    if (options.symbols && options.symbols.length > 0) {
        url += `?symbols=${options.symbols.map(s => encodeURIComponent(s)).join(',')}`;
    } else if (options.group) {
        url += `?group=${options.group}`;
    }

    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data) as BatchProgressEvent;

            if (data.type === 'complete') {
                onProgress(data);
                onComplete();
                eventSource.close();
            } else if (data.type === 'error' && !data.symbol) {
                // Global error, not symbol-specific
                onError(data.message || 'Unknown error');
                eventSource.close();
            } else {
                onProgress(data);
            }
        } catch (e) {
            console.error('Failed to parse batch SSE data:', e);
        }
    };

    eventSource.onerror = () => {
        onError('Connection to server lost');
        eventSource.close();
    };

    // Return cleanup function
    return () => {
        eventSource.close();
    };
};
