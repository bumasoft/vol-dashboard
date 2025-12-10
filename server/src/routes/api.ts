import { Router, Request, Response } from 'express';
import { authenticate, fetchOptionChain, streamSkewCalculation, cleanupStreamer, searchSymbols } from '../services/tastytrade';
import { skewCache } from '../services/cache';

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
