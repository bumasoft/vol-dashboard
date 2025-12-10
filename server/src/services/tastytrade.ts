// @ts-ignore - The SDK might need specific handling
import TastytradeClient from '@tastytrade/api';
import { differenceInDays, parseISO } from 'date-fns';

const CLIENT_SECRET = process.env.TASTY_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.TASTY_REFRESH_TOKEN;
const IS_SANDBOX = process.env.TASTY_IS_SANDBOX === 'true';

// Global instance to reuse
let client: TastytradeClient | null = null;

// Track current subscription state for cleanup
let currentSubscribedSymbols: string[] = [];
let currentEventHandler: ((json: any) => void) | null = null;
let currentTimeout: ReturnType<typeof setTimeout> | null = null;

// @ts-ignore
const config = IS_SANDBOX ? TastytradeClient.SandboxConfig : TastytradeClient.ProdConfig;

export interface ChainResult {
    symbols: string[];
    expirationDate: string;
    dte: number;
}

export interface SkewResult {
    skew: number;
    expirationDate: string;
    dte: number;
    callOi: number;
    putOi: number;
    callDelta: number;
    putDelta: number;
    callStreamerSymbol: string;
    putStreamerSymbol: string;
}

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
    if (!client) await authenticate();

    try {
        // @ts-ignore
        const response = await client!.httpClient.getData(`/symbols/search/${encodeURIComponent(query)}`);
        const data = response?.data?.data?.items || response?.data?.items || response?.data || [];

        if (!Array.isArray(data)) {
            console.warn('Unexpected symbol search response:', data);
            return [];
        }

        return data.map((item: any) => ({
            symbol: item.symbol || item['symbol'],
            description: item.description || item['description'] || '',
            listedMarket: item['listed-market'] || item.listedMarket,
            instrumentType: item['instrument-type'] || item.instrumentType
        }));
    } catch (error) {
        console.error('Symbol search error:', error);
        return [];
    }
};

/**
 * Cleanup any existing streamer subscriptions and event listeners.
 */
export const cleanupStreamer = async (): Promise<void> => {
    if (!client) return;

    if (currentTimeout) {
        clearTimeout(currentTimeout);
        currentTimeout = null;
    }

    if (currentEventHandler) {
        try {
            // @ts-ignore
            client.quoteStreamer.removeEventListener(currentEventHandler);
            console.log("Removed previous event listener");
        } catch (e) {
            console.warn("Failed to remove event listener:", e);
        }
        currentEventHandler = null;
    }

    if (currentSubscribedSymbols.length > 0) {
        try {
            // @ts-ignore
            if (client.quoteStreamer.unsubscribe) {
                client.quoteStreamer.unsubscribe(currentSubscribedSymbols);
                console.log(`Unsubscribed from ${currentSubscribedSymbols.length} symbols`);
            }
        } catch (e) {
            console.warn("Failed to unsubscribe:", e);
        }
        currentSubscribedSymbols = [];
    }

    try {
        // @ts-ignore
        if (client.quoteStreamer.disconnect) {
            await client.quoteStreamer.disconnect();
            console.log("Disconnected streamer WebSocket");
        }
    } catch (e) {
        console.warn("Failed to disconnect streamer:", e);
    }
};

export const authenticate = async (): Promise<TastytradeClient> => {
    if (client) return client;

    if (!CLIENT_SECRET || !REFRESH_TOKEN) {
        throw new Error("Missing credentials. Set TASTY_CLIENT_SECRET and TASTY_REFRESH_TOKEN in server/.env");
    }

    console.log(`Initializing Tastytrade Client (${IS_SANDBOX ? 'Sandbox' : 'Prod'})...`);

    // @ts-ignore
    client = new TastytradeClient({
        // @ts-ignore
        ...config,
        clientSecret: CLIENT_SECRET,
        refreshToken: REFRESH_TOKEN,
        oauthScopes: ['read', 'trade']
    });

    return client;
};

export const fetchOptionChain = async (symbol: string): Promise<ChainResult> => {
    if (!client) throw new Error("Client not initialized");

    console.log("Fetching chain for", symbol);

    const hasSlash = symbol.startsWith('/');
    const normalizedSymbol = symbol.replace('/', '');

    const isFuturesContract = /^[A-Z0-9]{2,}[FGHJKMNQUVXZ]\d{1,2}$/.test(normalizedSymbol);
    const isFuturesRoot = hasSlash && /^[A-Z0-9]{2,}$/.test(normalizedSymbol);
    const isFutures = isFuturesContract || isFuturesRoot;

    let items: any[] = [];

    if (isFutures) {
        console.log(`Detected futures: ${normalizedSymbol}`);

        const rootSymbol = isFuturesContract
            ? normalizedSymbol.replace(/[FGHJKMNQUVXZ]\d{1,2}$/, '')
            : normalizedSymbol;

        // @ts-ignore
        const response = await client.httpClient.getData(`/futures-option-chains/${rootSymbol}/nested`);
        const data = response?.data?.data || response?.data || response;
        const optionChains = data['option-chains'] || [];

        if (!Array.isArray(optionChains) || optionChains.length === 0) {
            throw new Error("No option chains found in response.");
        }

        const optionChain = optionChains[0];
        items = optionChain.expirations || optionChain['expirations'] || [];

        if (items.length === 0) {
            throw new Error("No expirations found in option chain.");
        }
    } else {
        // @ts-ignore
        const chain = await client.instrumentsService.getNestedOptionChain(normalizedSymbol);

        if (Array.isArray(chain) && chain.length > 0 && chain[0].expirations) {
            items = chain[0].expirations;
        } else if (chain.data?.items) {
            items = chain.data.items;
        } else if (chain.items) {
            items = chain.items;
        } else if (chain.expirations) {
            items = chain.expirations;
        }
    }

    if (!Array.isArray(items) || items.length === 0) {
        throw new Error("Unexpected chain structure: could not find expirations list.");
    }

    // Filter for valid expiration types
    const validExpTypes = ['End-Of-Month', 'Regular'];
    const filteredExpItems = items.filter((exp: any) => {
        const expType = exp['expiration-type'] || exp.expirationType;
        return validExpTypes.includes(expType);
    });

    if (filteredExpItems.length === 0) {
        throw new Error("No End-Of-Month or Regular expirations found.");
    }

    const today = new Date();
    let bestExp: any = null;
    let minDiff = Infinity;
    const targetDte = 30;

    for (const exp of filteredExpItems) {
        const expDateStr = exp['expiration-date'] || exp.expirationDate;
        if (!expDateStr) continue;

        const expDate = parseISO(expDateStr);
        const dte = differenceInDays(expDate, today);

        if (dte < 0) continue;

        const diff = Math.abs(dte - targetDte);
        if (diff < minDiff) {
            minDiff = diff;
            bestExp = { ...exp, dte, expDateStr };
        }
    }

    if (!bestExp) {
        throw new Error("No suitable expiration found.");
    }

    console.log("Selected Expiration:", bestExp.expDateStr, "DTE:", bestExp.dte);

    const strikes = bestExp.strikes || [];
    const symbols: string[] = [];

    for (const strike of strikes) {
        if (strike['call-streamer-symbol']) symbols.push(strike['call-streamer-symbol']);
        if (strike['put-streamer-symbol']) symbols.push(strike['put-streamer-symbol']);
    }

    console.log(`Collected ${symbols.length} streamer symbols`);

    return {
        symbols,
        expirationDate: bestExp.expDateStr,
        dte: bestExp.dte
    };
};

export interface StreamProgress {
    type: 'chain' | 'phase1' | 'phase2' | 'result' | 'error';
    message?: string;
    data?: any;
}

/**
 * Stream skew calculation with progress callbacks for SSE
 */
export const streamSkewCalculation = async (
    symbol: string,
    onProgress: (progress: StreamProgress) => void
): Promise<void> => {
    try {
        // Cleanup any prior subscriptions
        await cleanupStreamer();

        // Authenticate
        await authenticate();

        // Fetch option chain
        const chainResult = await fetchOptionChain(symbol);
        onProgress({
            type: 'chain',
            message: `Fetched ${chainResult.symbols.length} symbols`,
            data: { symbolCount: chainResult.symbols.length, expirationDate: chainResult.expirationDate, dte: chainResult.dte }
        });

        if (chainResult.symbols.length === 0) {
            throw new Error("No symbols found in option chain");
        }

        // Connect to streamer
        console.log("Connecting to streamer...");
        await client!.quoteStreamer.connect();

        // ====== PHASE 1: Stream all symbols to get deltas ======
        console.log(`[Phase 1] Subscribing to ${chainResult.symbols.length} symbols...`);
        client!.quoteStreamer.subscribe(chainResult.symbols);
        currentSubscribedSymbols = [...chainResult.symbols];

        onProgress({ type: 'phase1', message: 'Collecting delta values...' });

        const deltaMap = await new Promise<Record<string, number>>((resolve) => {
            const deltas: Record<string, number> = {};

            const onDeltaMessage = (json: any) => {
                const events = Array.isArray(json) ? json : [json];
                for (const event of events) {
                    const sym = event.eventSymbol || event.symbol;
                    const type = event.eventType;

                    if (!sym || !chainResult.symbols.includes(sym)) continue;

                    if (type === 'Greeks' || event.greeks) {
                        const delta = event.greeks?.delta || event.delta;
                        if (typeof delta === 'number') {
                            deltas[sym] = delta;
                        }
                    }
                }
            };

            currentEventHandler = onDeltaMessage;
            // @ts-ignore
            client!.quoteStreamer.addEventListener(onDeltaMessage);

            currentTimeout = setTimeout(() => {
                console.log(`[Phase 1] Collected deltas for ${Object.keys(deltas).length} symbols`);
                if (currentEventHandler && client) {
                    try {
                        // @ts-ignore
                        client.quoteStreamer.removeEventListener(currentEventHandler);
                    } catch (e) { /* ignore */ }
                }
                currentEventHandler = null;
                resolve(deltas);
            }, 5000);
        });

        // ====== FILTER: Keep balanced calls and puts in 10-30 delta range ======
        const callCandidates: { symbol: string, delta: number }[] = [];
        const putCandidates: { symbol: string, delta: number }[] = [];

        for (const [sym, delta] of Object.entries(deltaMap)) {
            if (delta >= 0.10 && delta <= 0.30) {
                callCandidates.push({ symbol: sym, delta });
            }
            if (delta <= -0.10 && delta >= -0.30) {
                putCandidates.push({ symbol: sym, delta });
            }
        }

        callCandidates.sort((a, b) => Math.abs(a.delta - 0.20) - Math.abs(b.delta - 0.20));
        putCandidates.sort((a, b) => Math.abs(a.delta - (-0.20)) - Math.abs(b.delta - (-0.20)));

        const balancedCount = Math.min(callCandidates.length, putCandidates.length);
        const selectedCalls = callCandidates.slice(0, balancedCount);
        const selectedPuts = putCandidates.slice(0, balancedCount);

        const filteredSymbols = [
            ...selectedCalls.map(c => c.symbol),
            ...selectedPuts.map(p => p.symbol)
        ];

        if (filteredSymbols.length === 0) {
            throw new Error("No options found in the 10-30 delta range");
        }

        // Unsubscribe from all symbols before Phase 2
        try {
            // @ts-ignore
            if (client!.quoteStreamer.unsubscribe) {
                client!.quoteStreamer.unsubscribe(currentSubscribedSymbols);
            }
        } catch (e) {
            console.warn("Failed to unsubscribe between phases:", e);
        }

        // ====== PHASE 2: Stream filtered symbols for OI ======
        console.log(`[Phase 2] Subscribing to ${filteredSymbols.length} filtered symbols...`);
        client!.quoteStreamer.subscribe(filteredSymbols);
        currentSubscribedSymbols = [...filteredSymbols];

        onProgress({ type: 'phase2', message: `Collecting OI for ${filteredSymbols.length} symbols...` });

        const result = await new Promise<SkewResult>((resolve, reject) => {
            const dataStore: Record<string, { delta: number, oi?: number }> = {};

            for (const sym of filteredSymbols) {
                dataStore[sym] = { delta: deltaMap[sym] };
            }

            currentTimeout = setTimeout(() => {
                let callOiSum = 0;
                let putOiSum = 0;
                let callCount = 0;
                let putCount = 0;
                let avgCallDelta = 0;
                let avgPutDelta = 0;

                for (const [, data] of Object.entries(dataStore)) {
                    if (data.delta !== undefined && data.oi !== undefined && data.oi > 0) {
                        if (data.delta >= 0.10 && data.delta <= 0.30) {
                            callOiSum += data.oi;
                            avgCallDelta += data.delta * data.oi;
                            callCount++;
                        }
                        if (data.delta <= -0.10 && data.delta >= -0.30) {
                            putOiSum += data.oi;
                            avgPutDelta += data.delta * data.oi;
                            putCount++;
                        }
                    }
                }

                if (callOiSum > 0) avgCallDelta /= callOiSum;
                if (putOiSum > 0) avgPutDelta /= putOiSum;

                if (callOiSum > 0 && putOiSum > 0) {
                    const skew = putOiSum / callOiSum;
                    resolve({
                        skew,
                        expirationDate: chainResult.expirationDate,
                        dte: chainResult.dte,
                        callOi: callOiSum,
                        putOi: putOiSum,
                        callDelta: avgCallDelta,
                        putDelta: avgPutDelta,
                        callStreamerSymbol: `${callCount} options`,
                        putStreamerSymbol: `${putCount} options`
                    });
                } else {
                    reject(new Error(`Timeout: Got OI for ${callCount} calls and ${putCount} puts`));
                }
            }, 10000);

            const onOiMessage = (json: any) => {
                const events = Array.isArray(json) ? json : [json];

                for (const event of events) {
                    const sym = event.eventSymbol || event.symbol;
                    const type = event.eventType;

                    if (!sym || !filteredSymbols.includes(sym)) continue;

                    if (type === 'Summary' || event.summary || type === 'Quote') {
                        const oi = event.summary?.openInterest || event.openInterest;
                        if (typeof oi === 'number' && dataStore[sym]) {
                            dataStore[sym].oi = oi;
                        }
                    }
                }
            };

            currentEventHandler = onOiMessage;
            // @ts-ignore
            client!.quoteStreamer.addEventListener(onOiMessage);
        });

        onProgress({ type: 'result', data: result });

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        onProgress({ type: 'error', message });
    } finally {
        // Cleanup after streaming
        await cleanupStreamer();
    }
};
