import { PrismaClient } from '@prisma/client';
import { SkewResult } from './tastytrade';

// Singleton Prisma client
const prisma = new PrismaClient();

export interface SkewHistoryQuery {
    symbol: string;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
}

/**
 * Save a skew calculation snapshot to the database
 */
export async function saveSkewSnapshot(symbol: string, result: SkewResult): Promise<void> {
    try {
        await prisma.skewSnapshot.create({
            data: {
                symbol: symbol.toUpperCase(),
                oiSkew: result.skew,
                pricingSkew: result.pricingSkew,
                impliedMove: result.impliedMove,
                underlyingPrice: result.underlyingPrice,
                dte: result.dte,
                expirationDate: result.expirationDate,
                callOi: result.callOi,
                putOi: result.putOi,
                callDelta: result.callDelta,
                putDelta: result.putDelta,
            },
        });
        console.log(`[DB] Saved skew snapshot for ${symbol}`);
    } catch (error) {
        console.error(`[DB] Failed to save snapshot for ${symbol}:`, error);
        // Don't throw - we don't want DB errors to break the calculation flow
    }
}

/**
 * Get historical skew snapshots for a symbol
 */
export async function getSkewHistory(query: SkewHistoryQuery) {
    const { symbol, limit = 100, startDate, endDate } = query;

    const where: any = {
        symbol: symbol.toUpperCase(),
    };

    // Add date range filter if provided
    if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) where.timestamp.gte = startDate;
        if (endDate) where.timestamp.lte = endDate;
    }

    return prisma.skewSnapshot.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
    });
}

/**
 * Get all unique symbols that have history
 */
export async function getTrackedSymbols(): Promise<string[]> {
    const results = await prisma.skewSnapshot.findMany({
        select: { symbol: true },
        distinct: ['symbol'],
        orderBy: { symbol: 'asc' },
    });
    return results.map((r: { symbol: string }) => r.symbol);
}

/**
 * Get the latest snapshot for each tracked symbol
 */
export async function getLatestSnapshots() {
    const symbols = await getTrackedSymbols();
    const snapshots = await Promise.all(
        symbols.map(async (symbol) => {
            const latest = await prisma.skewSnapshot.findFirst({
                where: { symbol },
                orderBy: { timestamp: 'desc' },
            });
            return latest;
        })
    );
    return snapshots.filter(Boolean);
}

// Export prisma client for direct access if needed
export { prisma };
