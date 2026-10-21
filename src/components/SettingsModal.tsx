import { useEffect, useState } from 'react';
import { Volume2, X } from 'lucide-react';
import QRCode from 'qrcode';
import { useStore } from '../state/useStore';
import { engine } from '../audio/engineInstance';
import { pairIndexLabel } from '../audio/AudioEngine';

type Tab = 'audio' | 'click' | 'pad' | 'remote' | 'account' | 'update' | 'license';

const TABS: { id: Tab; label: string }[] = [
  { id: 'audio', label: 'Áudio' },
  { id: 'click', label: 'Click' },
  { id: 'pad', label: 'Pad' },
  { id: 'remote', label: 'Remoto' },
  { id: 'account', label: 'Conta' },
  { id: 'update', label: 'Atualização' },
  { id: 'license', label: 'Registro' },
];

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('audio');
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [addresses, setAddresses] = useState<string[]>([]);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then((devices) => {
      setOutputs(devices.filter((d) => d.kind === 'audiooutput'));
    });
    window.api.net.localAddresses().then(setAddresses);
  }, []);

  useEffect(() => {
    if (tab !== 'remote' || addresses.length === 0) return;
    const url = `http://${addresses[0]}:${settings.remote.port}`;
    QRCode.toDataURL(url, { margin: 1, width: 180 }).then(setQr);
  }, [tab, addresses, settings.remote.port]);

  function testOutput(pairIndex: number, side: 'L' | 'R') {
    const ctx = engine.ctx;
    const channelCount = Math.max(2, settings.outputChannelCount);
    const merger = ctx.createChannelMerger(channelCount);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.3;
    osc.frequency.value = 880;
    osc.connect(gain);
    const channel = pairIndex * 2 + (side === 'L' ? 0 : 1);
    gain.connect(merger, 0, Math.min(channel, channelCount - 1));
    merger.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Ajustes</h2>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="modal-tabs">
            {TABS.map((t) => (
              <button key={t.id} className={`modal-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="modal-pane">
            {tab === 'audio' && (
              <div>
                <div className="field-row">
                  <div className="label">Dispositivo de saída</div>
                  <select
                    value={settings.outputDeviceId ?? ''}
                    onChange={(e) => updateSettings({ outputDeviceId: e.target.value || null })}
                  >
                    <option value="">Padrão do sistema</option>
                    {outputs.map((o) => (
                      <option key={o.deviceId} value={o.deviceId}>{o.label || 'Dispositivo de áudio'}</option>
                    ))}
                  </select>
                </div>
                <div className="field-row">
                  <div className="label">Canais de saída do dispositivo</div>
                  <select
                    value={settings.outputChannelCount}
                    onChange={async (e) => {
                      const n = parseInt(e.target.value, 10);
                      await updateSettings({ outputChannelCount: n });
                      await engine.setChannelCount(n);
                    }}
                  >
                    {[2, 4, 6, 8, 16].map((n) => (
                      <option key={n} value={n}>{n} canais ({n / 2} pares estéreo)</option>
                    ))}
                  </select>
                </div>
                <div className="field-row">
                  <div className="label">Taxa de amostragem</div>
                  <div className="hint">{engine.ctx.sampleRate.toLocaleString('pt-BR')} Hz</div>
                </div>
                <h4>Testar saídas</h4>
                {Array.from({ length: Math.floor(settings.outputChannelCount / 2) }, (_, i) => (
                  <div className="field-row" key={i}>
                    <div className="label">{pairIndexLabel(i)}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn" onClick={() => testOutput(i, 'L')}><Volume2 size={14} style={{ marginRight: 4 }} />Esquerda</button>
                      <button className="btn" onClick={() => testOutput(i, 'R')}><Volume2 size={14} style={{ marginRight: 4 }} />Direita</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'click' && (
              <div>
                <div className="field-row">
                  <div>
                    <div className="label">Contagem de entrada</div>
                    <div className="hint">Antes de a música entrar.</div>
                  </div>
                  <select
                    value={settings.click.countInBars}
                    onChange={(e) => updateSettings({ click: { ...settings.click, countInBars: parseInt(e.target.value, 10) } })}
                  >
                    <option value={0}>Sem contagem</option>
                    <option value={1}>1 compasso</option>
                    <option value={2}>2 compassos</option>
                  </select>
                </div>
                <div className="field-row">
                  <div>
                    <div className="label">Som do click</div>
                    <div className="hint">Gerado pelo programa.</div>
                  </div>
                  <select
                    value={settings.click.sound}
                    onChange={(e) => updateSettings({ click: { ...settings.click, sound: e.target.value as any } })}
                  >
                    <option value="beep">Bipe</option>
                    <option value="click">Clique seco</option>
                    <option value="rimshot">Rimshot</option>
                    <option value="cowbell">Cowbell</option>
                  </select>
                </div>
                <div className="field-row">
                  <div>
                    <div className="label">Acento no tempo 1</div>
                    <div className="hint">Tempo 1 mais agudo e forte.</div>
                  </div>
                  <select
                    value={settings.click.accentFirstBeat ? 'on' : 'off'}
                    onChange={(e) => updateSettings({ click: { ...settings.click, accentFirstBeat: e.target.value === 'on' } })}
                  >
                    <option value="on">Ligado</option>
                    <option value="off">Desligado</option>
                  </select>
                </div>
                <div className="field-row">
                  <div className="label">Volume do click</div>
                  <input
                    type="range" min={-30} max={6} step={1}
                    value={settings.click.volumeDb}
                    onChange={(e) => updateSettings({ click: { ...settings.click, volumeDb: parseFloat(e.target.value) } })}
                  />
                </div>
              </div>
            )}

            {tab === 'pad' && (
              <div>
                <div className="field-row">
                  <div>
                    <div className="label">Timbre</div>
                    <div className="hint">Pad sintetizado embutido (sem necessidade de arquivos externos).</div>
                  </div>
                  <select value="synth" disabled>
                    <option value="synth">Pad sintetizado</option>
                  </select>
                </div>
                <div className="field-row">
                  <div className="label">Volume do pad</div>
                  <input
                    type="range" min={-30} max={6} step={1}
                    value={settings.pad.volumeDb}
                    onChange={(e) => updateSettings({ pad: { ...settings.pad, volumeDb: parseFloat(e.target.value) } })}
                  />
                </div>
                <div className="field-row">
                  <div>
                    <div className="label">Sair no play</div>
                    <div className="hint">Volta quando a música parar.</div>
                  </div>
                  <select
                    value={settings.pad.exitOnPlay ? 'on' : 'off'}
                    onChange={(e) => updateSettings({ pad: { ...settings.pad, exitOnPlay: e.target.value === 'on' } })}
                  >
                    <option value="on">Ligado</option>
                    <option value="off">Desligado</option>
                  </select>
                </div>
                <div className="field-row">
                  <div className="label">Subida e descida (s)</div>
                  <input
                    type="number" min={0.1} step={0.1}
                    value={settings.pad.fadeInOutSec}
                    style={{ width: 80 }}
                    onChange={(e) => updateSettings({ pad: { ...settings.pad, fadeInOutSec: parseFloat(e.target.value) } })}
                  />
                </div>
                <div className="field-row">
                  <div className="label">Troca de tom (s)</div>
                  <input
                    type="number" min={0.1} step={0.1}
                    value={settings.pad.keyChangeCrossfadeSec}
                    style={{ width: 80 }}
                    onChange={(e) => updateSettings({ pad: { ...settings.pad, keyChangeCrossfadeSec: parseFloat(e.target.value) } })}
                  />
                </div>
              </div>
            )}

            {tab === 'remote' && (
              <div>
                <div className="field-row">
                  <div>
                    <div className="label">Controle pelo celular</div>
                    <div className="hint">Abra o endereço abaixo no navegador do celular, na mesma rede.</div>
                  </div>
                  <select
                    value={settings.remote.enabled ? 'on' : 'off'}
                    onChange={(e) => updateSettings({ remote: { ...settings.remote, enabled: e.target.value === 'on' } })}
                  >
                    <option value="on">Ligado</option>
                    <option value="off">Desligado</option>
                  </select>
                </div>
                <div className="field-row">
                  <div className="label">Porta</div>
                  <input
                    type="number"
                    value={settings.remote.port}
                    style={{ width: 100 }}
                    onChange={(e) => updateSettings({ remote: { ...settings.remote, port: parseInt(e.target.value, 10) || 8787 } })}
                  />
                </div>
                <div className="field-row">
                  <div className="label">PIN</div>
                  <input
                    value={settings.remote.pin}
                    style={{ width: 100 }}
                    onChange={(e) => updateSettings({ remote: { ...settings.remote, pin: e.target.value } })}
                  />
                </div>
                {settings.remote.enabled && addresses.length > 0 && (
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 10 }}>
                    {qr && <img src={qr} alt="QR do controle remoto" style={{ borderRadius: 8 }} />}
                    <div>
                      {addresses.map((a) => (
                        <div key={a} style={{ fontFamily: 'monospace' }}>http://{a}:{settings.remote.port}</div>
                      ))}
                      <div className="hint" style={{ marginTop: 6 }}>Escaneie o QR ou digite o endereço no navegador do celular.</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'account' && (
              <div>
                <p className="hint">
                  O MRQ - Multitracks Play funciona totalmente offline, sem conta obrigatória. Suas músicas e
                  configurações ficam só neste computador.
                </p>
              </div>
            )}

            {tab === 'update' && (
              <div>
                <div className="field-row">
                  <div className="label">Versão instalada</div>
                  <div className="hint">0.1.0</div>
                </div>
                <p className="hint">Verificação automática de atualização ainda não está disponível nesta versão.</p>
              </div>
            )}

            {tab === 'license' && (
              <div>
                <p className="hint">Esta versão é de uso livre durante o desenvolvimento do MRQ - Multitracks Play.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
