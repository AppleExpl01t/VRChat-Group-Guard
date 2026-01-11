import React, { useEffect, useState, useMemo } from 'react';
import { useGroupStore } from '../../../stores/groupStore';
import { GlassPanel } from '../../../components/ui/GlassPanel';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays, startOfDay } from 'date-fns';

export const AnalyticsView: React.FC = () => {
    const { selectedGroup } = useGroupStore();
    const [activityData, setActivityData] = useState<{ date: string, count: number }[]>([]);
    const [automodData, setAutomodData] = useState<{ date: string, count: number, action: string }[]>([]);
    const [heatmapData, setHeatmapData] = useState<{ dayOfWeek: string, hour: string, count: number }[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!selectedGroup) return;
        setLoading(true);
        
        Promise.all([
            window.electron.stats.getActivity(selectedGroup.id, 30),
            window.electron.stats.getHeatmap(selectedGroup.id)
        ]).then(([activityRes, heatmapRes]) => {
             // Parse activity
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             const traffic = (activityRes.traffic as any[]) || [];
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             setActivityData(traffic);
             
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             setAutomodData(activityRes.automod as any[] || []);
             
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             setHeatmapData(heatmapRes as any[]);
             
             setLoading(false);
        }).catch(err => {
            console.error("Failed to load stats", err);
            setLoading(false);
        });
    }, [selectedGroup]);

    // Process Growth Chart Data
    const growthChartData = useMemo(() => {
        const data = [];
        const today = startOfDay(new Date());
        for (let i = 29; i >= 0; i--) {
            const date = subDays(today, i);
            const dateStr = format(date, 'yyyy-MM-dd'); // Matches SQLite strftime output used in backend
            
            const joinCount = activityData.find(d => d.date === dateStr)?.count || 0;
            const kickCount = automodData.filter(d => d.date === dateStr && (d.action === 'REJECT' || d.action === 'AUTO_BLOCK')).reduce((a, b) => a + b.count, 0);

            data.push({
                name: format(date, 'MMM dd'),
                NewJoins: joinCount,
                AutoMod: kickCount
            });
        }
        return data;
    }, [activityData, automodData]);

    // Process Heatmap Data
    // Grid: 7 rows (Mon-Sun), 24 cols (0-23)
    // Backend returns dayOfWeek (0-6, 0=Sunday)
    const heatmapGrid = useMemo(() => {
        const grid = [];
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        
        for (let d = 0; d < 7; d++) {
            const row = [];
            for (let h = 0; h < 24; h++) {
                // Find matching entry
                const cell = heatmapData.find(item => 
                    parseInt(item.dayOfWeek) === d && parseInt(item.hour) === h
                );
                row.push(cell ? cell.count : 0);
            }
            grid.push({ day: days[d], hours: row });
        }
        // Rotate so Mon is first? Standard starts Sun usually.
        return grid;
    }, [heatmapData]);

    // Calculate max value for heatmap color scaling
    const maxHeat = useMemo(() => {
        return Math.max(...heatmapGrid.flatMap(row => row.hours), 1);
    }, [heatmapGrid]);

    const getHeatColor = (value: number) => {
        if (value === 0) return 'rgba(255,255,255,0.02)';
        const intensity = Math.min((value / maxHeat), 1);
        // Green hue, variable opacity
        return `rgba(74, 222, 128, ${0.1 + (intensity * 0.9)})`;
    };

    if (loading) {
        return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-dim)' }}>Loading Analytics...</div>
    }

    if (!selectedGroup) return <div style={{ padding: '2rem' }}>Select a group to view analytics.</div>;

    return (
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%', overflowY: 'auto' }}>
           
           {/* Growth Chart */}
           <GlassPanel style={{ height: '350px', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: 'white', fontWeight: 600, flexShrink: 0 }}>30-Day Activity Growth</h3>
                <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={growthChartData}>
                                <defs>
                                    <linearGradient id="colorJoins" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#4ade80" stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor="#4ade80" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorAutoMod" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f87171" stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor="#f87171" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                <XAxis dataKey="name" stroke="var(--color-text-dim)" fontSize={12} tickMargin={10} minTickGap={30} />
                                <YAxis stroke="var(--color-text-dim)" fontSize={12} />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Area type="monotone" dataKey="NewJoins" stroke="#4ade80" fillOpacity={1} fill="url(#colorJoins)" name="Instance Visits" />
                                <Area type="monotone" dataKey="AutoMod" stroke="#f87171" fillOpacity={1} fill="url(#colorAutoMod)" name="AutoMod Blocks" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
           </GlassPanel>

           {/* Heatmap */}
           <GlassPanel style={{ padding: '1.5rem', flex: 1, minHeight: '300px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0, color: 'white', fontWeight: 600 }}>Activity Heatmap</h3>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>Low to High Intensity</div>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    
                    {/* Header Row (Hours) */}
                    <div style={{ display: 'flex', marginLeft: '50px', marginBottom: '5px' }}>
                         {Array.from({ length: 24 }).map((_, i) => (
                             <div key={i} style={{ flex: 1, fontSize: '0.65rem', color: 'var(--color-text-dim)', textAlign: 'center' }}>
                                 {i % 2 === 0 ? i : ''}
                             </div>
                         ))}
                    </div>

                    {/* Rows */}
                    {heatmapGrid.map((row, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '4px', height: '30px' }}>
                            {/* Day Label */}
                            <div style={{ 
                                width: '50px', 
                                display: 'flex', 
                                alignItems: 'center', 
                                fontSize: '0.75rem', 
                                fontWeight: 600, 
                                color: 'var(--color-text-dim)' 
                            }}>
                                {row.day}
                            </div>
                            
                            {/* Cells */}
                            {row.hours.map((val, hIdx) => (
                                <div 
                                    key={hIdx}
                                    title={`${val} visits at ${hIdx}:00`}
                                    style={{
                                        flex: 1,
                                        background: getHeatColor(val),
                                        borderRadius: '4px',
                                        transition: 'all 0.2s',
                                        cursor: 'default'
                                    }}
                                />
                            ))}
                        </div>
                    ))}
                </div>
           </GlassPanel>

        </div>
    );
};
