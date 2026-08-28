import {useCallback, useEffect, useRef, useState} from 'react';

const VOLUME_KEY = 'magma:volume';
const CUES_KEY = 'magma:cues';
export type AudioCue = 'begin' | 'return' | 'smallWin' | 'breathe' | 'reset' | 'complete';

const CUES: Record<AudioCue, {frequencies: number[]; spacing: number; duration: number; wave: OscillatorType}> = {
  begin: {frequencies: [261.63, 392], spacing: 0.1, duration: 0.55, wave: 'triangle'},
  return: {frequencies: [392], spacing: 0, duration: 0.42, wave: 'sine'},
  smallWin: {frequencies: [659.25, 880], spacing: 0.08, duration: 0.5, wave: 'sine'},
  breathe: {frequencies: [220, 146.83], spacing: 0.35, duration: 1.25, wave: 'sine'},
  reset: {frequencies: [329.63, 220], spacing: 0.1, duration: 0.55, wave: 'triangle'},
  complete: {frequencies: [523.25, 659.25, 783.99], spacing: 0.12, duration: 0.92, wave: 'sine'},
};

export const useAmbientAudio = () => {
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [cuesEnabled, setCuesEnabledState] = useState(() => localStorage.getItem(CUES_KEY) === 'true');
  const [volume, setVolumeState] = useState(() => Math.min(1, Math.max(0, Number(localStorage.getItem(VOLUME_KEY)) || 0.24)));

  const ensureGraph = useCallback(async () => {
    const AudioContextClass = window.AudioContext;
    const context = contextRef.current ?? new AudioContextClass();
    contextRef.current = context;
    if (context.state === 'suspended') await context.resume();
    if (!sourceRef.current) {
      const seconds = 3;
      const buffer = context.createBuffer(2, context.sampleRate * seconds, context.sampleRate);
      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const data = buffer.getChannelData(channel);
        let brown = 0;
        for (let index = 0; index < data.length; index += 1) {
          brown = (brown + 0.018 * (Math.random() * 2 - 1)) / 1.018;
          data[index] = brown * 2.8;
        }
      }
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      filter.type = 'lowpass';
      filter.frequency.value = 760;
      filter.Q.value = 0.35;
      gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(context.destination);
      source.start();
      sourceRef.current = source;
      gainRef.current = gain;
    }
    return context;
  }, []);

  const rampTo = useCallback((target: number) => {
    const context = contextRef.current;
    const gain = gainRef.current;
    if (!context || !gain) return;
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setTargetAtTime(target, context.currentTime, 0.055);
  }, []);

  const toggle = useCallback(async () => {
    if (!enabled) {
      await ensureGraph();
      rampTo(volume);
      setEnabled(true);
    } else {
      rampTo(0);
      setEnabled(false);
    }
  }, [enabled, ensureGraph, rampTo, volume]);

  const setVolume = useCallback((next: number) => {
    const safe = Math.min(1, Math.max(0, next));
    setVolumeState(safe);
    localStorage.setItem(VOLUME_KEY, String(safe));
    if (enabled) rampTo(safe);
  }, [enabled, rampTo]);

  const playCue = useCallback(async (cue: AudioCue, preview = false) => {
    if (!cuesEnabled && !preview) return;
    let context: AudioContext;
    try {
      context = await ensureGraph();
    } catch {
      return;
    }
    const start = context.currentTime;
    const treatment = CUES[cue];
    treatment.frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = treatment.wave;
      oscillator.frequency.value = frequency;
      const cueStart = start + index * treatment.spacing;
      gain.gain.setValueAtTime(0, cueStart);
      gain.gain.linearRampToValueAtTime(cue === 'breathe' ? 0.035 : 0.065, cueStart + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, cueStart + treatment.duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(cueStart);
      oscillator.stop(cueStart + treatment.duration + 0.02);
    });
  }, [cuesEnabled, ensureGraph]);

  const setCuesEnabled = useCallback((next: boolean) => {
    setCuesEnabledState(next);
    localStorage.setItem(CUES_KEY, String(next));
    if (next) void ensureGraph();
  }, [ensureGraph]);

  const silence = useCallback(() => {
    rampTo(0);
    setEnabled(false);
    setCuesEnabled(false);
  }, [rampTo, setCuesEnabled]);

  const playChime = useCallback(() => playCue('complete'), [playCue]);

  useEffect(() => () => {
    sourceRef.current?.stop();
    contextRef.current?.close();
  }, []);

  return {enabled, volume, cuesEnabled, toggle, setVolume, setCuesEnabled, playCue, playChime, silence};
};
