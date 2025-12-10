export const ASSET_GROUPS = {
    fx: {
        name: 'FX',
        symbols: ['/6E', '/6B', '/6A', '/6C', '/6J']
    },
    indices: {
        name: 'Indices',
        symbols: ['/ES', '/NQ', '/RTY']
    },
    bonds: {
        name: 'Bonds',
        symbols: ['/ZB', '/ZN', '/ZF', '/ZT']
    },
    crypto: {
        name: 'Crypto',
        symbols: ['/BTC', '/ETH']
    }
} as const;

export const SYMBOL_DESCRIPTIONS: Record<string, string> = {
    // FX
    '/6E': 'Euro FX',
    '/6B': 'British Pound',
    '/6A': 'Australian Dollar',
    '/6C': 'Canadian Dollar',
    '/6J': 'Japanese Yen',
    // Indices
    '/ES': 'E-mini S&P 500',
    '/NQ': 'E-mini Nasdaq 100',
    '/YM': 'E-mini Dow',
    '/RTY': 'E-mini Russell 2000',
    // Bonds
    '/ZB': '30-Year T-Bond',
    '/ZN': '10-Year T-Note',
    '/ZF': '5-Year T-Note',
    '/ZT': '2-Year T-Note',
    // Crypto
    '/BTC': 'Bitcoin',
    '/ETH': 'Ethereum'
};

export type AssetGroupKey = keyof typeof ASSET_GROUPS;
export type AssetGroup = typeof ASSET_GROUPS[AssetGroupKey];

export const ALL_SYMBOLS = Object.values(ASSET_GROUPS).flatMap(g => g.symbols);

export const getGroupForSymbol = (symbol: string): AssetGroupKey | null => {
    for (const [key, group] of Object.entries(ASSET_GROUPS)) {
        if ((group.symbols as readonly string[]).includes(symbol)) {
            return key as AssetGroupKey;
        }
    }
    return null;
};
