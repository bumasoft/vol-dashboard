import { Router, Request, Response } from 'express';
import { authenticate, fetchOptionChain, streamSkewCalculation, cleanupStreamer, searchSymbols } from '../services/tastytrade';
import { skewCache } from '../services/cache';
import { saveSkewSnapshot, getSkewHistory, getTrackedSymbols, getLatestSnapshots } from '../services/db';
import { ASSET_GROUPS, ALL_SYMBOLS, AssetGroupKey, SYMBOL_DESCRIPTIONS } from '../config/assets';

export const apiRouter = Router();

// Helper to normalize symbol for cache key (uppercase, no leading slash variations)
const getCacheKey = (symbol: string): string => {
    return symbol.toUpperCase().replace(/^\/+/, '');
};

// Health check
apiRouter.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        cache: skewCache.stats()
    });
});

// Get market status for all assets (cached/uncached status)
apiRouter.get('/market-status', (_req: Request, res: Response) => {
    const status: Record<string, { cached: boolean; data: any | null }> = {};

    for (const symbol of ALL_SYMBOLS) {
        const cacheKey = getCacheKey(symbol);
        const cachedResult = skewCache.get(cacheKey);
        status[symbol] = {
            cached: cachedResult !== null,
            data: cachedResult
        };
    }

    res.json({
        groups: ASSET_GROUPS,
        descriptions: SYMBOL_DESCRIPTIONS,
        status
    });
});

// SSE endpoint for batch skew calculation (sequential processing)
// Note: Sequential processing required because Tastytrade streamer is a shared resource
apiRouter.get('/stream-batch', async (req: Request, res: Response) => {
    const symbolsParam = req.query.symbols as string | undefined;
    const groupParam = req.query.group as AssetGroupKey | undefined;

    // Determine which symbols to process
    let symbols: string[] = [];
    if (symbolsParam) {
        symbols = symbolsParam.split(',').map(s => s.trim());
    } else if (groupParam && ASSET_GROUPS[groupParam]) {
        symbols = [...ASSET_GROUPS[groupParam].symbols];
    } else {
        symbols = [...ALL_SYMBOLS];
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: 'connected', symbols, total: symbols.length })}\n\n`);

    // Track state
    const results: Record<string, any> = {};
    const errors: Record<string, string> = {};
    let isClientConnected = true;

    // Handle client disconnect
    req.on('close', () => {
        isClientConnected = false;
        console.log('Batch stream client disconnected');
        cleanupStreamer();
    });

    // Send progress event helper
    const sendProgress = (symbol: string, status: string, data?: any) => {
        if (!isClientConnected) return;
        res.write(`data: ${JSON.stringify({ type: 'progress', symbol, status, data })}\n\n`);
    };

    // Process a single symbol
    const processSymbol = async (symbol: string): Promise<void> => {
        if (!isClientConnected) return;

        const cacheKey = getCacheKey(symbol);

        // Check cache first
        const cachedResult = skewCache.get(cacheKey);
        if (cachedResult) {
            sendProgress(symbol, 'cached', cachedResult);
            results[symbol] = cachedResult;
            return;
        }

        sendProgress(symbol, 'calculating');

        try {
            await authenticate();

            await new Promise<void>((resolve) => {
                streamSkewCalculation(symbol, (progress) => {
                    if (!isClientConnected) {
                        resolve();
                        return;
                    }

                    if (progress.type === 'phase1' || progress.type === 'phase2') {
                        sendProgress(symbol, progress.type, { message: progress.message });
                    } else if (progress.type === 'result') {
                        skewCache.set(cacheKey, progress.data);
                        // Save to database for historical tracking
                        saveSkewSnapshot(symbol, progress.data);
                        results[symbol] = progress.data;
                        sendProgress(symbol, 'complete', progress.data);
                        resolve();
                    } else if (progress.type === 'error') {
                        errors[symbol] = progress.message || 'Unknown error';
                        sendProgress(symbol, 'error', { error: progress.message });
                        resolve();
                    }
                });
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            errors[symbol] = message;
            sendProgress(symbol, 'error', { error: message });
        }
    };

    // Process all symbols sequentially
    const runBatch = async () => {
        for (const symbol of symbols) {
            if (!isClientConnected) break;
            await processSymbol(symbol);
        }

        // All done
        if (isClientConnected) {
            res.write(`data: ${JSON.stringify({
                type: 'complete',
                results,
                errors,
                summary: {
                    total: symbols.length,
                    successful: Object.keys(results).length,
                    failed: Object.keys(errors).length
                }
            })}\n\n`);
            res.write('event: close\ndata: done\n\n');
            res.end();
        }
    };

    runBatch().catch(err => {
        console.error('Batch processing error:', err);
        if (isClientConnected) {
            res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
            res.end();
        }
    });
});

// Symbol search endpoint
apiRouter.get('/symbols/search/:query', async (req: Request, res: Response) => {
    try {
        const { query } = req.params;

        if (!query || query.length < 1) {
            res.json([]);
            return;
        }

        await authenticate();
        const results = await searchSymbols(query);
        res.json(results);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Symbol search error:', message);
        res.status(500).json({ error: message });
    }
});

// Fetch option chain for a symbol
apiRouter.get('/option-chain/:symbol', async (req: Request, res: Response) => {
    try {
        const { symbol } = req.params;

        await authenticate();
        const result = await fetchOptionChain(symbol);

        res.json(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Option chain error:', message);
        res.status(500).json({ error: message });
    }
});

// SSE endpoint for streaming skew calculation (with caching)
apiRouter.get('/stream-skew/:symbol', async (req: Request, res: Response) => {
    const { symbol } = req.params;
    const cacheKey = getCacheKey(symbol);

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Check cache first
    const cachedResult = skewCache.get(cacheKey);
    if (cachedResult) {
        console.log(`[Cache HIT] ${cacheKey}`);
        res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Found cached result!' })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'cached', message: 'Using cached data (1 hour TTL)' })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'result', data: cachedResult })}\n\n`);
        res.write('event: close\ndata: done\n\n');
        res.end();
        return;
    }

    console.log(`[Cache MISS] ${cacheKey} - fetching fresh data`);

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Starting calculation...' })}\n\n`);

    // Handle client disconnect
    req.on('close', () => {
        console.log('Client disconnected, cleaning up...');
        cleanupStreamer();
    });

    try {
        await streamSkewCalculation(symbol, (progress) => {
            // Send progress event to client
            res.write(`data: ${JSON.stringify(progress)}\n\n`);

            // Cache the result and end stream
            if (progress.type === 'result') {
                skewCache.set(cacheKey, progress.data);
                // Save to database for historical tracking
                saveSkewSnapshot(symbol, progress.data);
                console.log(`[Cache SET] ${cacheKey} - cached for 1 hour`);
                res.write('event: close\ndata: done\n\n');
                res.end();
            } else if (progress.type === 'error') {
                res.write('event: close\ndata: done\n\n');
                res.end();
            }
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
        res.end();
    }
});

// Get cached result directly (non-streaming, returns null if not cached)
apiRouter.get('/skew/:symbol', async (req: Request, res: Response) => {
    const { symbol } = req.params;
    const cacheKey = getCacheKey(symbol);

    const cached = skewCache.get(cacheKey);
    if (cached) {
        res.json({ cached: true, data: cached });
    } else {
        res.json({ cached: false, data: null });
    }
});

// Clear cache for a symbol (or all if no symbol provided)
apiRouter.delete('/cache/:symbol?', (_req: Request, res: Response) => {
    const { symbol } = _req.params;

    if (symbol) {
        const cacheKey = getCacheKey(symbol);
        skewCache.delete(cacheKey);
        res.json({ cleared: cacheKey });
    } else {
        skewCache.clear();
        res.json({ cleared: 'all' });
    }
});

// Cleanup endpoint (for manual cleanup if needed)
apiRouter.post('/cleanup', async (_req: Request, res: Response) => {
    try {
        await cleanupStreamer();
        res.json({ status: 'cleaned up' });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: message });
    }
});

// ========== HISTORY ENDPOINTS ==========

// Get historical skew data for a symbol
apiRouter.get('/history/:symbol', async (req: Request, res: Response) => {
    try {
        const { symbol } = req.params;
        const { limit, startDate, endDate } = req.query;

        const history = await getSkewHistory({
            symbol,
            limit: limit ? parseInt(limit as string, 10) : 100,
            startDate: startDate ? new Date(startDate as string) : undefined,
            endDate: endDate ? new Date(endDate as string) : undefined,
        });

        res.json({
            symbol: symbol.toUpperCase(),
            count: history.length,
            data: history,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('History query error:', message);
        res.status(500).json({ error: message });
    }
});

// Get all symbols with historical data
apiRouter.get('/history', async (_req: Request, res: Response) => {
    try {
        const symbols = await getTrackedSymbols();
        const latest = await getLatestSnapshots();

        res.json({
            symbols,
            latest,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('History symbols error:', message);
        res.status(500).json({ error: message });
    }
});
