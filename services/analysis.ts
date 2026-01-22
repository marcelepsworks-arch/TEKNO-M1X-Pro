import { TrackMetadata, BeatGrid, EnergyProfile, CuePoints } from '../types';
import { BeatParser } from './beatParser';
import { guess } from 'web-audio-beat-detector';

declare global {
  interface Window {
    EssentiaWASM: any;
    Essentia: any;
    webkitAudioContext: typeof AudioContext;
  }
}

const TARGET_BPM = 125;
const CDNS = [
  'https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.wasm',
  'https://unpkg.com/essentia.js@0.1.3/dist/essentia-wasm.wasm'
];

export class AnalysisEngine {
  private audioContext: AudioContext | null = null;
  private essentia: any = null;
  private isReady: boolean = false;
  private useLiteMode: boolean = false; // Fallback flag
  private initPromise: Promise<void> | null = null;

  constructor() {
    // Lazy initialization
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.audioContext;
  }

  private async initializeEssentia() {
    if (this.isReady) return;

    // 1. Check if global scripts are even loaded
    if (typeof window.Essentia === 'undefined' || typeof window.EssentiaWASM === 'undefined') {
      console.warn("[DSP] Essentia Global Scripts missing. Switching to Lite Mode.");
      this.useLiteMode = true;
      this.isReady = true;
      return;
    }

    try {
      let wasmBinary: ArrayBuffer | null = null;
      
      // 2. Try fetching WASM from multiple CDNs
      for (const url of CDNS) {
        try {
          const response = await fetch(url, { mode: 'cors' });
          if (response.ok) {
            wasmBinary = await response.arrayBuffer();
            console.log(`[DSP] Loaded Essentia WASM from: ${url}`);
            break; // Success
          }
        } catch (e) {
          // Silent fail on individual mirrors
        }
      }

      if (!wasmBinary) {
        throw new Error("All WASM mirrors failed.");
      }
      
      const essentiaModule = await window.EssentiaWASM({
        wasmBinary: wasmBinary,
        onRuntimeInitialized: () => {
          console.log('[DSP] Essentia WASM Runtime Initialized');
        }
      });

      this.essentia = new window.Essentia(essentiaModule);
      this.isReady = true;
    } catch (error) {
      // Graceful degradation
      console.log('[DSP] Network restricted (WASM fetch failed). Optimizing for Lite Mode.');
      this.useLiteMode = true; 
      this.isReady = true;
    }
  }

  async analyzeTrack(file: File, trackId: string): Promise<TrackMetadata> {
    if (!this.initPromise) {
      this.initPromise = this.initializeEssentia();
    }
    await this.initPromise;

    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();

    // 1. Decode
    let audioBuffer: AudioBuffer;
    try {
      const arrayBuffer = await file.arrayBuffer();
      audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    } catch (e) {
      throw new Error(`Audio Decoding Failed: ${(e as Error).message}`);
    }

    // --- BRANCH: LITE MODE (Web Audio Only) ---
    if (this.useLiteMode) {
      return this.analyzeLite(audioBuffer, file, trackId);
    }

    // --- BRANCH: FULL ESSENTIA MODE ---
    try {
      const channelData = audioBuffer.getChannelData(0); 
      const vectorSignal = this.essentia.arrayToVector(channelData);

      // Rhythm (Essentia)
      const rhythm = this.essentia.RhythmExtractor2013(vectorSignal);
      const essentiaBpm = rhythm.bpm;
      const rawBeats = this.essentia.vectorToArray(rhythm.ticks);
      let confidence = rhythm.confidence || 0.5;

      // Key
      const keyData = this.essentia.KeyExtractor(vectorSignal);
      const camelotKey = this.mapToCamelot(keyData.key, keyData.scale);

      // Energy
      const energyProfile = this.computeEnergyProfile(vectorSignal);
      const grooveIndex = this.calculateGrooveIndex(energyProfile.low);

      // Detector Refinement (Web Audio Beat Detector)
      let consensusBpm = essentiaBpm;
      let consensusOffset = -1;

      try {
        // Run secondary analysis for validation and phase correction
        const { bpm, offset } = await guess(audioBuffer);
        
        const delta = Math.abs(bpm - essentiaBpm);
        
        // Logic to determine best fit
        if (delta < 2.0) {
            // Strong agreement: Average BPM, prioritize Detector Offset (better phase)
            consensusBpm = (bpm + essentiaBpm) / 2;
            consensusOffset = offset;
            confidence = Math.min(confidence + 0.2, 0.99); 
        } else if (Math.abs(bpm * 2 - essentiaBpm) < 3.0) {
            // Octave mismatch (Detector is half speed): Trust Essentia BPM, but check offset
            consensusBpm = essentiaBpm;
            consensusOffset = offset; 
            confidence = Math.max(confidence, 0.7);
        } else if (Math.abs(bpm / 2 - essentiaBpm) < 3.0) {
            // Octave mismatch (Detector is double speed): Trust Essentia BPM
            consensusBpm = essentiaBpm;
            consensusOffset = offset;
            confidence = Math.max(confidence, 0.7);
        } else {
            // Disagreement: Trust Essentia but lower confidence
            console.warn(`[DSP] BPM Mismatch: Essentia ${essentiaBpm.toFixed(2)} vs Detector ${bpm.toFixed(2)}`);
            confidence = Math.max(confidence - 0.2, 0.1);
        }
      } catch (err) {
        console.warn('[DSP] Detector refinement failed', err);
      }

      // Normalization & Fallback
      if (consensusBpm < 80) consensusBpm *= 2;
      if (consensusBpm > 160) consensusBpm /= 2;
      if (consensusBpm < 60 || isNaN(consensusBpm) || consensusBpm === 0) {
          consensusBpm = 125;
          confidence = 0.1;
      }
      
      const beatGrid = BeatParser.getLockedGrid(rawBeats, consensusBpm, audioBuffer.duration, consensusOffset);
      
      const cuePoints = this.detectCuePoints(beatGrid, energyProfile, audioBuffer.duration);
      const gainFactor = this.calculateAutoGain(channelData);

      return {
        id: trackId,
        file,
        name: file.name.replace(/\.[^/.]+$/, ""),
        duration: audioBuffer.duration,
        originalBpm: Number(consensusBpm.toFixed(2)),
        key: camelotKey,
        beatGrid,
        energyProfile,
        cuePoints,
        gainFactor,
        grooveIndex,
        confidence,
        status: 'READY',
        playbackRatio: TARGET_BPM / consensusBpm
      };

    } catch (essentiaError) {
      console.error("[DSP] Essentia processing crashed. Retrying with Lite Mode.", essentiaError);
      return this.analyzeLite(audioBuffer, file, trackId);
    }
  }

  // --- LITE MODE IMPLEMENTATION ---
  private async analyzeLite(audioBuffer: AudioBuffer, file: File, trackId: string): Promise<TrackMetadata> {
    console.log(`[DSP] Analyzing ${file.name} in LITE MODE...`);
    
    // 1. BPM via Web Audio Detector
    let bpm = 125;
    let offset = 0;
    let confidence = 0.3; // Low confidence default for Lite Mode

    try {
      const result = await guess(audioBuffer);
      bpm = result.bpm;
      offset = result.offset;
      confidence = 0.6; // Better confidence if detector actually works
    } catch (e) {
      console.warn("[DSP] Lite Mode: BPM detection failed, defaulting to 125", e);
    }

    // Normalize BPM
    if (bpm < 80) bpm *= 2;
    if (bpm > 160) bpm /= 2;
    if (isNaN(bpm) || bpm === 0) bpm = 125;

    // 2. Manual Energy Analysis
    const channelData = audioBuffer.getChannelData(0);
    const energyProfile = this.calculateManualEnergyProfile(channelData);
    const grooveIndex = this.calculateGrooveIndex(energyProfile.low);

    // 3. Construct Grid (Synthetic)
    // Create synthetic beat markers because we don't have Essentia's tick detection
    const beatGrid = BeatParser.getLockedGrid([], bpm, audioBuffer.duration, offset);

    // 4. Cues & Gain
    const cuePoints = this.detectCuePoints(beatGrid, energyProfile, audioBuffer.duration);
    const gainFactor = this.calculateAutoGain(channelData);

    return {
        id: trackId,
        file,
        name: file.name.replace(/\.[^/.]+$/, ""),
        duration: audioBuffer.duration,
        originalBpm: Number(bpm.toFixed(2)),
        key: '12A', // Default to generic minor in Lite Mode
        beatGrid,
        energyProfile,
        cuePoints,
        gainFactor,
        grooveIndex,
        confidence,
        status: 'READY', // Success!
        playbackRatio: TARGET_BPM / bpm
    };
  }

  // --- HELPERS ---

  private calculateManualEnergyProfile(data: Float32Array): EnergyProfile {
    // Splits audio into 200 chunks and calculates RMS
    const segments = 200;
    const chunkSize = Math.floor(data.length / segments);
    const profile: number[] = [];
    
    for (let i = 0; i < segments; i++) {
        const start = i * chunkSize;
        let sum = 0;
        for (let j = 0; j < chunkSize; j++) {
            if (start + j < data.length) sum += data[start + j] * data[start + j];
        }
        profile.push(Math.sqrt(sum / chunkSize));
    }
    // In Lite Mode, we use the broadband RMS for all bands as an approximation
    return { low: profile, mid: profile, high: profile };
  }

  private calculateGrooveIndex(lowEnergy: number[]): number {
    if (lowEnergy.length === 0) return 0;
    const sum = lowEnergy.reduce((a, b) => a + b, 0);
    const mean = sum / lowEnergy.length;
    const variance = lowEnergy.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / lowEnergy.length;
    const stdDev = Math.sqrt(variance);
    const groove = Math.min((stdDev / 0.1) * 100, 100);
    return Math.round(groove);
  }

  private calculateAutoGain(pcmData: Float32Array): number {
    let sum = 0;
    const step = 200; 
    for (let i = 0; i < pcmData.length; i += step) {
      sum += pcmData[i] * pcmData[i];
    }
    const rms = Math.sqrt(sum / (pcmData.length / step));
    const TARGET_RMS = 0.20; 
    if (rms < 0.001) return 1;
    const gain = TARGET_RMS / rms;
    return Math.min(Math.max(gain, 0.5), 2.0);
  }

  private detectCuePoints(beatGrid: BeatGrid, energy: EnergyProfile, duration: number): CuePoints {
    // 1. Start Point (Intro)
    let startPoint = 0;
    if (beatGrid.downbeats.length > 0) {
      startPoint = beatGrid.downbeats[0];
    }

    // 2. End Point (Outro) via Energy Drop
    const samples = energy.low.length;
    if (samples === 0) return { start: 0, end: duration - 15, loopRegion: { start: duration - 20, end: duration - 15 } };
    
    const timePerSample = duration / samples;
    const searchStartIndex = Math.floor(samples * 0.70);
    
    let mainSum = 0;
    let mainCount = 0;
    for (let i = Math.floor(samples * 0.2); i < Math.floor(samples * 0.7); i++) {
        mainSum += energy.low[i];
        mainCount++;
    }
    const mainAvg = mainCount > 0 ? mainSum / mainCount : 0.5;
    const dropThreshold = mainAvg * 0.6; 

    let outroTime = duration - 15; 
    
    for (let i = searchStartIndex; i < samples - 5; i++) {
        const currentAvg = (energy.low[i] + energy.low[i+1] + energy.low[i+2]) / 3;
        if (currentAvg < dropThreshold) {
            outroTime = i * timePerSample;
            break; 
        }
    }

    // Snap to Grid
    const nearestDownbeat = beatGrid.downbeats.reduce((prev, curr) => 
        Math.abs(curr - outroTime) < Math.abs(prev - outroTime) ? curr : prev
    , beatGrid.downbeats[beatGrid.downbeats.length - 1] || duration);

    let endPoint = nearestDownbeat;

    if (endPoint > duration - 5) endPoint = duration - 5;
    if (endPoint < duration * 0.6) endPoint = duration * 0.9;
    
    // 3. Loop Region (4 bars before end)
    const beatsPerBar = 4;
    const barsToLoop = 4;
    const beatsToLoop = barsToLoop * beatsPerBar;
    const secondsPerBeat = 60 / beatGrid.bpm;
    const loopDuration = beatsToLoop * secondsPerBeat;
    
    let loopStart = endPoint - loopDuration;
    let loopEnd = endPoint;

    // Snap Loop Start
    const snapLoopStart = beatGrid.downbeats.reduce((prev, curr) => 
       Math.abs(curr - loopStart) < Math.abs(prev - loopStart) ? curr : prev
    , loopStart);
    
    if (Math.abs(snapLoopStart - loopStart) < 2.0) {
        loopStart = snapLoopStart;
    }

    if (loopStart < startPoint) loopStart = Math.max(0, duration - 30);
    if (loopEnd <= loopStart) loopEnd = duration;

    return {
      start: startPoint,
      end: loopEnd,
      loopRegion: { start: loopStart, end: loopEnd }
    };
  }

  private computeEnergyProfile(vectorSignal: any): EnergyProfile {
    try {
      const data = this.essentia.vectorToArray(vectorSignal);
      const samplesPerPoint = Math.floor(data.length / 200);
      if (samplesPerPoint <= 0) return { low: [], mid: [], high: [] };
      const low = [];
      for (let i = 0; i < 200; i++) {
        let sum = 0;
        const start = i * samplesPerPoint;
        for (let j = 0; j < samplesPerPoint; j++) {
           if (start + j < data.length) {
               sum += data[start+j] * data[start+j];
           }
        }
        low.push(Math.sqrt(sum/samplesPerPoint));
      }
      return { low, mid: [...low], high: [...low] };
    } catch (e) {
      return { low: [], mid: [], high: [] };
    }
  }

  private mapToCamelot(key: string, scale: string): string {
    const isMinor = scale === 'minor';
    const suffix = isMinor ? 'A' : 'B';
    const majorMap: Record<string, number> = {
      'B': 1, 'F#': 2, 'Gb': 2, 'Db': 3, 'C#': 3, 'Ab': 4, 'G#': 4,
      'Eb': 5, 'D#': 5, 'Bb': 6, 'A#': 6, 'F': 7, 'C': 8, 'G': 9,
      'D': 10, 'A': 11, 'E': 12
    };
    const minorMap: Record<string, number> = {
      'Ab': 1, 'G#': 1, 'Eb': 2, 'D#': 2, 'Bb': 3, 'A#': 3, 'F': 4,
      'C': 5, 'G': 6, 'D': 7, 'A': 8, 'E': 9, 'B': 10, 'F#': 11, 'Gb': 11,
      'Db': 12, 'C#': 12
    };
    const map = isMinor ? minorMap : majorMap;
    let normKey = key.replace('sharp', '#').replace('flat', 'b');
    const index = map[normKey] || 0;
    return index > 0 ? `${index}${suffix}` : `${key}`;
  }
}

export const analysisEngine = new AnalysisEngine();