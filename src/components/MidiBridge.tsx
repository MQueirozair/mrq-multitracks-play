import { useEffect } from 'react';
import { useStore } from '../state/useStore';
import { initMidi, setBindings, setDispatcher } from '../midi/midiController';
import { padEngine } from '../audio/engineInstance';

/** Componente sem interface: liga o MIDI aos comandos do app. Monte uma vez no topo. */
export default function MidiBridge() {
  const settings = useStore((s) => s.settings);

  useEffect(() => {
    initMidi();
  }, []);

  useEffect(() => {
    setBindings(settings.midiBindings);
  }, [settings.midiBindings]);

  useEffect(() => {
    setDispatcher((binding) => {
      const state = useStore.getState();
      switch (binding.action) {
        case 'transport:play':
          state.play();
          break;
        case 'transport:pause':
          state.pause();
          break;
        case 'transport:stop':
          state.stop();
          break;
        case 'transport:prev':
          state.jumpRelative(-1);
          break;
        case 'transport:next':
          state.jumpRelative(1);
          break;
        case 'transport:loop':
          state.toggleLoopActivePart();
          break;
        case 'pad:toggle': {
          const song = state.currentSong;
          if (!song) break;
          if (padEngine.playing) padEngine.stop(state.settings.pad.fadeInOutSec);
          else {
            padEngine.setVolumeDb(state.settings.pad.volumeDb);
            padEngine.start(song.currentKey, state.settings.pad.fadeInOutSec);
          }
          break;
        }
        case 'partType': {
          const song = state.currentSong;
          if (!song || !binding.partType) break;
          const currentIdx = song.parts.findIndex((p) => p.id === state.engineState.activePartId);
          const ordered = song.parts.map((p, i) => ({ p, i }));
          const ahead = ordered.filter((x) => x.i > currentIdx && x.p.type === binding.partType);
          const behind = ordered.filter((x) => x.i <= currentIdx && x.p.type === binding.partType).reverse();
          const target = ahead[0]?.p ?? behind[0]?.p;
          if (target) state.jumpToPart(target.id);
          break;
        }
        default:
          break;
      }
    });
  }, []);

  return null;
}
