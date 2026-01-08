import React, { useEffect, useState } from 'react';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { NeonButton } from '../../components/ui/NeonButton';

interface OscConfig {
    enabled: boolean;
    senderIp: string;
    senderPort: number;
    receiverPort: number;
}

export const OscSettings: React.FC = () => {
    const [config, setConfig] = useState<OscConfig>({
        enabled: false,
        senderIp: '127.0.0.1',
        senderPort: 9000,
        receiverPort: 9001
    });
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<string>('');

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        try {
            // electron API
            const current = await window.electron.osc.getConfig();
            if (current) setConfig(current);
        } catch (err) {
            console.error(err);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            // electron API
            await window.electron.osc.setConfig(config);
            setStatus('Saved!');
            setTimeout(() => setStatus(''), 2000);
        } catch (e) {
            console.error(e);
            setStatus('Error saving');
        }
        setLoading(false);
    };

    const handleTest = async () => {
         try {
             setStatus('Saving & Testing...');
             // Ensure backend has latest config, forcing enabled for the test
             const testConfig = { ...config, enabled: true };
             // electron API
             await window.electron.osc.setConfig(testConfig);
             
             // electron API
             const r1 = await window.electron.osc.send('/chatbox/typing', [true]);
             if (!r1) throw new Error("Backend returned false");

             setTimeout(async () => {
                 // electron API
                 await window.electron.osc.send('/chatbox/typing', [false]);
                 
                 // Also send a chatbox message
                 // electron API
                 await window.electron.osc.send('/chatbox/input', [" Group guard: OSC connected successfully", true, true]);
                 
                 setStatus('Test signal sent!');
                 setTimeout(() => setStatus(''), 2000);
             }, 1000);
             
             // Update UI to match the forced enable
             if (!config.enabled) setConfig(testConfig);
         } catch (e) {
             console.error(e);
             setStatus('Test failed: Check Logs');
         }
    };

    return (
        <section>
            <h2 style={{ color: 'white', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>OSC Integration</h2>
            <GlassPanel>
                <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
                     {/* Enabled Toggle */}
                     <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ color: 'white', fontWeight: 600 }}>Enable OSC</div>
                            <div style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>Allow sending automated messages and commands to VRChat</div>
                        </div>
                        <div 
                            onClick={() => setConfig({...config, enabled: !config.enabled})}
                            style={{
                                width: '50px',
                                height: '26px',
                                background: config.enabled ? 'var(--color-success)' : 'rgba(255,255,255,0.1)',
                                borderRadius: '13px',
                                position: 'relative',
                                cursor: 'pointer',
                                transition: 'background 0.3s ease',
                                border: '1px solid rgba(255,255,255,0.1)'
                            }}
                        >
                            <div style={{
                                width: '20px',
                                height: '20px',
                                background: 'white',
                                borderRadius: '50%',
                                position: 'absolute',
                                top: '2px',
                                left: config.enabled ? '26px' : '2px',
                                transition: 'left 0.3s ease',
                                boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                            }} />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', color: 'var(--color-text-dim)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Target IP</label>
                            <input 
                                type="text" 
                                value={config.senderIp}
                                onChange={(e) => setConfig({...config, senderIp: e.target.value})}
                                style={{ 
                                    width: '100%', 
                                    padding: '0.6rem', 
                                    background: 'rgba(0,0,0,0.3)', 
                                    border: '1px solid var(--border-color)', 
                                    color: 'white',
                                    borderRadius: '6px',
                                    outline: 'none'
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', color: 'var(--color-text-dim)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Sender Port (VRChat listens on 9000)</label>
                            <input 
                                type="number" 
                                value={config.senderPort}
                                onChange={(e) => setConfig({...config, senderPort: parseInt(e.target.value)})}
                                style={{ 
                                    width: '100%', 
                                    padding: '0.6rem', 
                                    background: 'rgba(0,0,0,0.3)', 
                                    border: '1px solid var(--border-color)', 
                                    color: 'white',
                                    borderRadius: '6px',
                                    outline: 'none'
                                }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem', alignItems: 'center' }}>
                        {status && <span style={{ color: status.includes('Error') || status.includes('failed') ? 'var(--color-error)' : 'var(--color-success)', fontSize: '0.9rem' }}>{status}</span>}
                        <NeonButton variant="ghost" onClick={handleTest}>
                            Test Connection
                        </NeonButton>
                        <NeonButton variant="primary" onClick={handleSave} disabled={loading}>
                            {loading ? 'Saving...' : 'Save Configuration'}
                        </NeonButton>
                    </div>
                </div>
            </GlassPanel>
        </section>
    );
};
