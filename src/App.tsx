import { useState, useEffect, useRef } from 'react';
import { streamSkewCalculation, checkHealth, searchSymbols } from './services/tasty';
import type { SkewResult, SymbolSearchResult } from './services/tasty';
import { MarketOverview } from './components/MarketOverview';

type ViewMode = 'single' | 'market';

function App() {
  const [symbol, setSymbol] = useState('/ES');
  const [status, setStatus] = useState('');
  const [skew, setSkew] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<SkewResult | null>(null);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('market');
  const cleanupRef = useRef<(() => void) | null>(null);

  // Autosuggest state
  const [searchResults, setSearchResults] = useState<SymbolSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check server health on mount
  useEffect(() => {
    checkHealth().then(setServerOnline);
  }, []);

  // Debounced symbol search
  const handleSymbolChange = (value: string) => {
    const upperValue = value.toUpperCase();
    setSymbol(upperValue);
    setSelectedIndex(-1);

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Don't search if empty or too short
    if (upperValue.length < 1) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    // Debounce search
    setSearchLoading(true);
    searchTimeoutRef.current = setTimeout(async () => {
      const results = await searchSymbols(upperValue);
      setSearchResults(results);
      setShowDropdown(results.length > 0);
      setSearchLoading(false);
    }, 300);
  };

  // Handle selecting a symbol from dropdown
  const handleSelectSymbol = (selectedSymbol: string) => {
    setSymbol(selectedSymbol);
    setShowDropdown(false);
    setSearchResults([]);
    inputRef.current?.focus();
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || searchResults.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < searchResults.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : searchResults.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && searchResults[selectedIndex]) {
          handleSelectSymbol(searchResults[selectedIndex].symbol);
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        break;
    }
  };

  const handleCalculate = async () => {
    // Cleanup any existing stream
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    setLoading(true);
    setSkew(null);
    setDetails(null);
    setStatus('Connecting to server...');

    // Start SSE stream
    cleanupRef.current = streamSkewCalculation(
      symbol,
      // Progress handler
      (progress) => {
        switch (progress.type) {
          case 'connected':
            setStatus('Connected. Starting calculation...');
            break;
          case 'cached':
            setStatus('⚡ Using cached result (1 hour TTL)');
            break;
          case 'chain':
            setStatus(`Fetched ${progress.data?.symbolCount || 0} symbols...`);
            break;
          case 'phase1':
            setStatus('Phase 1: Collecting delta values...');
            break;
          case 'phase2':
            setStatus(progress.message || 'Phase 2: Collecting OI...');
            break;
        }
      },
      // Complete handler
      (result) => {
        setSkew(result.skew);
        setDetails(result);
        setStatus('');
        setLoading(false);
        cleanupRef.current = null;
      },
      // Error handler
      (error) => {
        setStatus(`Error: ${error}`);
        setLoading(false);
        cleanupRef.current = null;
      }
    );
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, []);

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a] text-white flex flex-col items-center p-4 relative overflow-hidden font-sans">
      {/* Background Glow Orbs */}
      <div className="glow-orb-blue top-[-15%] left-[-10%]" />
      <div className="glow-orb-emerald bottom-[-15%] right-[-10%]" />

      {/* Header with Logo and View Toggle */}
      <div className="w-full max-w-[1200px] relative z-10 animate-fade-in pt-8 pb-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="TradingNirvana Logo" className="w-12 h-12 opacity-90 drop-shadow-[0_0_15px_rgba(34,197,94,0.3)]" />
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight gradient-text">
                TradingNirvana™
              </h1>
              <p className="text-white/40 text-xs font-medium tracking-widest uppercase">Volatility Dashboard</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* View Mode Toggle */}
            <div className="view-toggle">
              <button
                className={`view-toggle__btn ${viewMode === 'market' ? 'view-toggle__btn--active' : ''}`}
                onClick={() => setViewMode('market')}
              >
                Market Overview
              </button>
              <button
                className={`view-toggle__btn ${viewMode === 'single' ? 'view-toggle__btn--active' : ''}`}
                onClick={() => setViewMode('single')}
              >
                Single Asset
              </button>
            </div>

            {/* Server status indicator */}
            <div className="flex items-center gap-2 text-xs">
              <div className={`w-2 h-2 rounded-full ${serverOnline === null ? 'bg-gray-500' :
                serverOnline ? 'bg-green-500' : 'bg-red-500'
                }`} />
              <span className="text-white/40">
                {serverOnline === null ? 'Checking...' :
                  serverOnline ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {viewMode === 'market' ? (
        <MarketOverview serverOnline={serverOnline} />
      ) : (
        <div className="max-w-xl w-full relative z-10 animate-fade-in flex-1 flex items-center">
          <div className="glass-card rounded-3xl p-8 md:p-12 w-full">

            <div className="space-y-6">
              <div className="autosuggest-container">
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 ml-1">Asset Symbol</label>
                <input
                  ref={inputRef}
                  type="text"
                  value={symbol}
                  onChange={(e) => handleSymbolChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                  className="w-full rounded-xl px-5 py-4 text-xl font-medium placeholder-white/20"
                  placeholder="/ES"
                  autoComplete="off"
                />

                {/* Autosuggest Dropdown */}
                {showDropdown && (
                  <div className="autosuggest-dropdown">
                    {searchLoading ? (
                      <div className="autosuggest-loading">Searching...</div>
                    ) : (
                      searchResults.slice(0, 10).map((result, index) => (
                        <div
                          key={result.symbol}
                          className={`autosuggest-item ${index === selectedIndex ? 'selected' : ''}`}
                          onClick={() => handleSelectSymbol(result.symbol)}
                          onMouseEnter={() => setSelectedIndex(index)}
                        >
                          <span className="symbol">{result.symbol}</span>
                          <span className="description">{result.description}</span>
                          {result.instrumentType && (
                            <span className="type-badge">{result.instrumentType}</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={handleCalculate}
                disabled={loading || serverOnline === false}
                className="btn-gradient w-full py-4 rounded-xl font-bold text-lg tracking-wide text-white disabled:opacity-50"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Processing...</span>
                  </div>
                ) : 'Calculate Skew'}
              </button>

              {status && (
                <div className={`text-center text-sm font-medium ${status.includes('Error') ? 'text-red-400 bg-red-500/10 py-2 rounded-lg' : 'text-white/40'} animate-in fade-in slide-in-from-bottom-2`}>
                  {status}
                </div>
              )}

              {skew !== null && details && (() => {
                const getSkewColor = (s: number) =>
                  s < 0.7 ? '#22c55e' : s < 1.0 ? '#facc15' : s < 1.3 ? '#f97316' : '#ef4444';

                // Normalize OI for averaging: when very bullish (< 0.5), invert
                const isBullishOi = skew < 0.5;
                const normalizedOi = isBullishOi ? (1 / skew) : skew;
                const avgSkew = details.pricingSkew !== null
                  ? (normalizedOi + details.pricingSkew) / 2
                  : skew;

                // Sentiment with reversed thresholds when OI is bullish
                const getSentiment = () => {
                  if (details.pricingSkew === null) {
                    // Just OI, use normal thresholds
                    return skew < 0.7 ? 'Bullish' : skew < 1.0 ? 'Neutral' : skew < 1.3 ? 'Sl. Bearish' : 'Bearish';
                  }
                  if (isBullishOi) {
                    // Inverted: higher avg = stronger bullish
                    return avgSkew > 1.3 ? 'Bullish' : avgSkew > 1.0 ? 'Sl. Bullish' : avgSkew > 0.7 ? 'Neutral' : 'Sl. Bearish';
                  }
                  // Normal thresholds
                  return avgSkew < 0.7 ? 'Bullish' : avgSkew < 1.0 ? 'Neutral' : avgSkew < 1.3 ? 'Sl. Bearish' : 'Bearish';
                };

                // Color: use inverted thresholds when bullish OI
                const getSentimentColor = () => {
                  if (details.pricingSkew === null) return getSkewColor(skew);
                  if (isBullishOi) {
                    return avgSkew > 1.3 ? '#22c55e' : avgSkew > 1.0 ? '#86efac' : avgSkew > 0.7 ? '#facc15' : '#f97316';
                  }
                  return getSkewColor(avgSkew);
                };

                return (
                  <div className="mt-8 bg-black/20 rounded-2xl border border-white/5 p-8 relative overflow-hidden animate-in zoom-in-95 duration-300">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-emerald-500 opacity-50" />

                    <div className="text-center mb-8">
                      <div className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4">10-30 Delta P/C Ratio</div>

                      {/* OI Skew */}
                      <div
                        className="flex items-baseline justify-center gap-3 mb-2 cursor-help"
                        title="OI Skew: Put Open Interest / Call Open Interest"
                      >
                        <span className="text-sm font-semibold text-white/40 uppercase w-16 text-right">OI</span>
                        <span
                          className="text-5xl md:text-6xl font-mono font-bold drop-shadow-2xl"
                          style={{ color: getSkewColor(skew) }}
                        >
                          {skew.toFixed(4)}
                        </span>
                      </div>

                      {/* Pricing Skew */}
                      <div
                        className="flex items-baseline justify-center gap-3 cursor-help"
                        title="Price Skew: Avg Put Mid Price / Avg Call Mid Price"
                      >
                        <span className="text-sm font-semibold text-white/40 uppercase w-16 text-right">Price</span>
                        <span
                          className="text-3xl md:text-4xl font-mono font-bold drop-shadow-xl"
                          style={{ color: details.pricingSkew !== null ? getSkewColor(details.pricingSkew) : 'rgba(255,255,255,0.4)' }}
                        >
                          {details.pricingSkew !== null ? details.pricingSkew.toFixed(4) : 'N/A'}
                        </span>
                      </div>

                      {/* Implied Move */}
                      <div
                        className="flex items-baseline justify-center gap-3 mt-2 cursor-help"
                        title={(() => {
                          if (details.impliedMove === null || details.underlyingPrice === null) {
                            return 'Implied Move: Expected price range by expiration (ATM straddle / underlying price)';
                          }
                          const decimals = symbol.startsWith('/6') ? 4 : 2;
                          const lower = (details.underlyingPrice * (1 - details.impliedMove / 100)).toFixed(decimals);
                          const upper = (details.underlyingPrice * (1 + details.impliedMove / 100)).toFixed(decimals);
                          return `Implied Move: ±${details.impliedMove.toFixed(2)}% | Range: ${lower} - ${upper}`;
                        })()}
                      >
                        <span className="text-sm font-semibold text-white/40 uppercase w-16 text-right">Move</span>
                        <span className="text-2xl md:text-3xl font-mono font-bold drop-shadow-xl text-sky-400">
                          {details.impliedMove !== null ? `±${details.impliedMove.toFixed(2)}%` : 'N/A'}
                        </span>
                      </div>

                      {/* Sentiment based on average */}
                      <div
                        className="text-sm font-bold uppercase tracking-wider mt-4 cursor-help"
                        style={{ color: getSentimentColor() }}
                        title="Based on average of OI and Price skew"
                      >
                        {getSentiment()}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm border-t border-white/5 pt-6">
                      <div className="space-y-1">
                        <div className="text-white/30 text-xs uppercase font-semibold">Expiration</div>
                        <div className="font-medium text-white/90">{details.expirationDate}</div>
                      </div>
                      <div className="space-y-1 text-right">
                        <div className="text-white/30 text-xs uppercase font-semibold">DTE</div>
                        <div className="font-medium text-white/90">{details.dte} Days</div>
                      </div>

                      <div className="col-span-2 grid grid-cols-2 gap-4 bg-white/5 rounded-xl p-4 mt-2">
                        <div className="text-center">
                          <div className="text-blue-400/80 text-xs font-bold uppercase mb-1">Call OI</div>
                          <div className="text-white font-mono text-lg">{details.callOi.toLocaleString()}</div>
                        </div>
                        <div className="text-center border-l border-white/10">
                          <div className="text-emerald-400/80 text-xs font-bold uppercase mb-1">Put OI</div>
                          <div className="text-white font-mono text-lg">{details.putOi.toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
