import {useCallback, useEffect, useRef, useState} from 'react';

const VOLUME_KEY = 'magma:volume';

export const useAmbientAudio = () => {
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const [enabled, setEnabled] = useState(false);
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

  const playChime = useCallback(async () => {
    if (!enabled) return;
    const context = await ensureGraph();
    const start = context.currentTime;
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start + index * 0.12);
      gain.gain.linearRampToValueAtTime(0.075, start + index * 0.12 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + index * 0.12 + 0.9);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + index * 0.12);
      oscillator.stop(start + index * 0.12 + 0.92);
    });
  }, [enabled, ensureGraph]);

  useEffect(() => () => {
    sourceRef.current?.stop();
    contextRef.current?.close();
  }, []);

  return {enabled, volume, toggle, setVolume, playChime};
};
