import { useEffect, useState } from 'react';
import {
    ComposedChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';
import { format } from 'date-fns';

interface HistoryData {
    timestamp: string;
    oiSkew: number;
    pricingSkew: number | null;
    underlyingPrice: number | null;
}

interface SkewHistoryChartProps {
    symbol: string;
    onClose: () => void;
}

export function SkewHistoryChart({ symbol, onClose }: SkewHistoryChartProps) {
    const [data, setData] = useState<HistoryData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                setError(null);
                // Using relative URL based on setup
                const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/history/${encodeURIComponent(symbol)}?limit=100`);
                if (!res.ok) throw new Error('Failed to fetch history');

                const json = await res.json();

                // Process data for chart
                // Reverse if needed (API returns desc order, charts usually left-to-right asc)
                const chartData = json.data.reverse().map((item: any) => ({
                    ...item,
                    timestamp: new Date(item.timestamp).getTime(), // convert to timestamp for axis
                }));

                setData(chartData);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [symbol]);

    if (loading) {
        return (
            <div className="flex h-64 w-full items-center justify-center rounded-2xl bg-black/40 backdrop-blur-md">
                <div className="flex items-center gap-2 text-white/60">
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Loading history...</span>
                </div>
            </div>
        );
    }

    if (error || data.length === 0) {
        return (
            <div className="flex h-64 w-full items-center justify-center rounded-2xl bg-black/40 backdrop-blur-md">
                <div className="text-center">
                    <p className="text-red-400 mb-2">{error || 'No historical data available'}</p>
                    <button onClick={onClose} className="text-xs text-white/40 hover:text-white underline">
                        Close
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full overflow-hidden rounded-2xl bg-[#0a0a0a]/95 border border-white/10 p-4 shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 px-2">
                <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        {symbol} <span className="text-xs font-normal text-white/40 bg-white/5 px-2 py-0.5 rounded-full">History</span>
                    </h3>
                </div>
                <button
                    onClick={onClose}
                    className="rounded-full p-2 text-white/40 hover:bg-white/10 hover:text-white transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Chart */}
            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data}>
                        <defs>
                            <linearGradient id="colorOi" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis
                            dataKey="timestamp"
                            tickFormatter={(unix) => format(unix, 'MM/dd HH:mm')}
                            stroke="rgba(255,255,255,0.2)"
                            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                            minTickGap={30}
                        />

                        {/* Left Axis: Skew */}
                        <YAxis
                            yAxisId="left"
                            stroke="rgba(255,255,255,0.2)"
                            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                            domain={['auto', 'auto']}
                        />

                        {/* Right Axis: Price */}
                        <YAxis
                            yAxisId="right"
                            orientation="right"
                            stroke="rgba(34, 197, 94, 0.2)"
                            tick={{ fill: 'rgba(34, 197, 94, 0.4)', fontSize: 10 }}
                            domain={['auto', 'auto']}
                            tickFormatter={(val) => val.toFixed(0)}
                        />

                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#171717',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '8px',
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                            }}
                            labelFormatter={(label) => format(label, 'MMM dd, HH:mm')}
                            itemStyle={{ fontSize: '12px' }}
                        />

                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />

                        <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="oiSkew"
                            name="OI Skew"
                            stroke="#a855f7"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 0 }}
                        />

                        <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="pricingSkew"
                            name="Pricing Skew"
                            stroke="#facc15"
                            strokeWidth={2}
                            strokeDasharray="4 4"
                            dot={false}
                            connectNulls
                        />

                        <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="underlyingPrice"
                            name="Price"
                            stroke="#22c55e"
                            strokeWidth={1.5}
                            dot={false}
                            connectNulls
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
