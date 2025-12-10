/**
 * Simple in-memory cache with TTL (Time To Live)
 * Perfect for single-instance servers without Redis overhead
 */

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

class MemoryCache<T> {
    private cache = new Map<string, CacheEntry<T>>();
    private defaultTtlMs: number;

    constructor(defaultTtlMs: number = 60 * 60 * 1000) { // Default: 1 hour
        this.defaultTtlMs = defaultTtlMs;

        // Cleanup expired entries every 5 minutes
        setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }

    get(key: string): T | null {
        const entry = this.cache.get(key);

        if (!entry) return null;

        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        return entry.data;
    }

    set(key: string, data: T, ttlMs?: number): void {
        this.cache.set(key, {
            data,
            expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs)
        });
    }

    has(key: string): boolean {
        return this.get(key) !== null;
    }

    delete(key: string): void {
        this.cache.delete(key);
    }

    clear(): void {
        this.cache.clear();
    }

    private cleanup(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, entry] of this.cache) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`[Cache] Cleaned up ${cleaned} expired entries`);
        }
    }

    // For debugging
    size(): number {
        return this.cache.size;
    }

    stats(): { size: number; keys: string[] } {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}

// Export a singleton cache instance for skew results (1 hour TTL)
export const skewCache = new MemoryCache<any>(60 * 60 * 1000);

// Export the class for other use cases
export { MemoryCache };
