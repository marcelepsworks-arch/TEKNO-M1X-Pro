import { TrackMetadata, MixConfiguration, MixStyle, MixResult, TransitionTechnique } from '../types';

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

const TARGET_BPM = 125;
const BEAT_DURATION = 60 / TARGET_BPM; 
const BAR_DURATION = BEAT_DURATION * 4; 

// [UI-UX-ENGINEER] & [CORE-ARCHITECT]
// Weighted Transition Profiles per Artist Archetype
const STYLE_PROFILES: Record<MixStyle, Array<{ tech: TransitionTechnique, weight: number }>> = {
  [MixStyle.CAROLA]: [
    { tech: TransitionTechnique.LONG_BLEND, weight: 0.5 },
    { tech: TransitionTechnique.BASS_SWAP, weight: 0.4 },
    { tech: TransitionTechnique.SLOW_EQ_BLEND, weight: 0.1 }
  ],
  [MixStyle.MILLS]: [
    { tech: TransitionTechnique.HARD_CUT, weight: 0.4 },
    { tech: TransitionTechnique.LOOP_ECHO, weight: 0.3 },
    { tech: TransitionTechnique.DROP_SWAP, weight: 0.2 },
    { tech: TransitionTechnique.FILTER_SWEEP, weight: 0.1 }
  ],
  [MixStyle.GARNIER]: [
    { tech: TransitionTechnique.FILTER_SWEEP, weight: 0.5 },
    { tech: TransitionTechnique.SLOW_EQ_BLEND, weight: 0.3 },
    { tech: TransitionTechnique.LONG_BLEND, weight: 0.2 }
  ],
  [MixStyle.SANCHEZ]: [
    { tech: TransitionTechnique.PHRASE_MIXING, weight: 0.4 }, // Mapped to Slow EQ
    { tech: TransitionTechnique.LOOP_ECHO, weight: 0.3 },
    { tech: TransitionTechnique.SLOW_EQ_BLEND, weight: 0.3 }
  ],
  [MixStyle.SOLOMUN]: [
    { tech: TransitionTechnique.LONG_BLEND, weight: 0.6 },
    { tech: TransitionTechnique.DROP_SWAP, weight: 0.3 },
    { tech: TransitionTechnique.BASS_SWAP, weight: 0.1 }
  ],
  [MixStyle.SIMS]: [
    { tech: TransitionTechnique.HARD_CUT, weight: 0.3 },
    { tech: TransitionTechnique.DROP_SWAP, weight: 0.4 },
    { tech: TransitionTechnique.ECHO_OUT, weight: 0.3 }
  ],
  [MixStyle.MAY]: [
    { tech: TransitionTechnique.BASS_SWAP, weight: 0.4 },
    { tech: TransitionTechnique.SLOW_EQ_BLEND, weight: 0.4 },
    { tech: TransitionTechnique.FILTER_SWEEP, weight: 0.2 }
  ]
};

// Internal OLA (Overlap-Add) Time Stretcher
class InternalTimeStretcher {
    static process(buffer: AudioBuffer, speed: number): AudioBuffer {
        if (Math.abs(speed - 1.0) < 0.001) return buffer;
        console.log(`[MixEngine] Internal DSP Stretch: x${speed.toFixed(3)}`);

        const numChannels = buffer.numberOfChannels;
        const inputData = [];
        for(let c=0; c<numChannels; c++) inputData.push(buffer.getChannelData(c));
        
        const winSize = 4096;
        const overlap = 2; // 50% Overlap
        const hopSize = Math.floor(winSize / overlap); // Output Hop (Synthesis)
        const anaHop = Math.floor(hopSize * speed);    // Input Hop (Analysis)
        
        const newLength = Math.floor(buffer.length / speed);
        const outputData = [];
        for(let c=0; c<numChannels; c++) outputData.push(new Float32Array(newLength));

        const hanningWindow = new Float32Array(winSize);
        for (let i = 0; i < winSize; i++) {
            hanningWindow[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (winSize - 1)));
        }

        let inPos = 0;
        let outPos = 0;

        while (outPos < newLength - winSize && inPos < buffer.length - winSize) {
            for (let c = 0; c < numChannels; c++) {
                const inCh = inputData[c];
                const outCh = outputData[c];
                for (let i = 0; i < winSize; i++) {
                    const sample = inCh[Math.floor(inPos) + i];
                    outCh[outPos + i] += sample * hanningWindow[i];
                }
            }
            outPos += hopSize;
            inPos += anaHop;
        }

        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const newBuffer = ctx.createBuffer(numChannels, newLength, buffer.sampleRate);
        for (let c = 0; c < numChannels; c++) {
            newBuffer.copyToChannel(outputData[c], c);
        }

        return newBuffer;
    }
}

export class MixEngine {

  async renderMix(tracks: TrackMetadata[], config: MixConfiguration): Promise<MixResult> {
    const validTracks = tracks.filter(t => t.status === 'READY' && t.originalBpm > 0);
    if (validTracks.length === 0) throw new Error("No valid tracks to mix.");

    // 1. Prepare Tracks
    const processCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    const processedTracks: { 
      buffer: AudioBuffer; 
      metadata: TrackMetadata; 
      tempo: number;
    }[] = [];

    // Pre-process all tracks
    for (const track of validTracks) {
      try {
        const rawBuffer = await this.loadBuffer(track.file, processCtx);
        const tempo = TARGET_BPM / track.originalBpm;
        const stretchedBuffer = InternalTimeStretcher.process(rawBuffer, tempo);
        
        processedTracks.push({
          buffer: stretchedBuffer,
          metadata: track,
          tempo: tempo
        });

      } catch (e) {
        console.error(`[MixEngine] Failed to process ${track.name}`, e);
      }
    }

    if (processedTracks.length === 0) throw new Error("Failed to process any tracks.");

    // 2. Build Timeline
    let cursor = 0;
    const timelineEvents = [];
    
    for (let i = 0; i < processedTracks.length; i++) {
      const pTrack = processedTracks[i];
      const nextTrack = processedTracks[i+1];
      
      const technique = nextTrack ? this.chooseTechnique(config.style) : TransitionTechnique.SLOW_EQ_BLEND;
      const overlapBars = nextTrack ? this.getOverlapBars(technique) : 0;
      const overlapTime = overlapBars * BAR_DURATION; 

      // Logic Update: Scale cues to stretched time
      const scaleFactor = 1 / pTrack.tempo;

      const rawCueStart = pTrack.metadata.cuePoints?.start || 0;
      const rawCueEnd = pTrack.metadata.cuePoints?.end || pTrack.metadata.duration;
      const rawLoopStart = pTrack.metadata.cuePoints?.loopRegion?.start || 0;
      const rawLoopEnd = pTrack.metadata.cuePoints?.loopRegion?.end || 0;

      const bufferOffsetStart = rawCueStart * scaleFactor;
      const bufferOffsetEnd = rawCueEnd * scaleFactor;
      const bufferLoopStart = rawLoopStart * scaleFactor;
      const bufferLoopEnd = rawLoopEnd * scaleFactor;

      const eventDuration = bufferOffsetEnd - bufferOffsetStart;
      
      timelineEvents.push({
        trackIndex: i,
        startTime: cursor,
        buffer: pTrack.buffer,
        bufferOffsetStart, 
        bufferOffsetEnd,
        bufferLoopStart,
        bufferLoopEnd,
        overlapTime, 
        technique: technique,
        gain: pTrack.metadata.gainFactor || 1.0
      });

      // Update cursor
      if (nextTrack) {
        cursor += (eventDuration - overlapTime);
      } else {
        cursor += eventDuration;
      }
    }

    const totalDuration = Math.max(cursor + 10, 10); 

    // 3. Render Offline
    const offlineCtx = new OfflineAudioContext(2, 44100 * totalDuration, 44100);
    const masterGain = offlineCtx.createGain();
    masterGain.gain.value = 0.95; 

    // Limiter
    const limiter = offlineCtx.createDynamicsCompressor();
    limiter.threshold.value = -2.0;
    limiter.ratio.value = 12.0;
    masterGain.connect(limiter);
    limiter.connect(offlineCtx.destination);

    // Global FX
    const delayBus = this.createGlobalDelay(offlineCtx);
    delayBus.output.connect(masterGain);

    // Schedule Events
    for (const event of timelineEvents) {
      const strip = this.createChannelStrip(offlineCtx);
      strip.channelGain.connect(masterGain);
      strip.auxSend.connect(delayBus.input);

      const source = offlineCtx.createBufferSource();
      source.buffer = event.buffer;
      source.playbackRate.value = 1.0; 
      
      const wallDuration = event.bufferOffsetEnd - event.bufferOffsetStart;

      source.connect(strip.input);
      
      if (isFinite(event.startTime) && isFinite(event.bufferOffsetStart) && wallDuration > 0) {
          source.start(event.startTime, event.bufferOffsetStart);
          source.stop(event.startTime + wallDuration);
      } else {
          continue;
      }
      
      strip.channelGain.gain.setValueAtTime(event.gain, event.startTime);

      const isFirst = event.trackIndex === 0;
      const isLast = event.trackIndex === timelineEvents.length - 1;

      // Automation
      if (!isFirst) {
        const prevEvent = timelineEvents[event.trackIndex - 1];
        this.applyStemAutomation(prevEvent.technique, false, offlineCtx, strip, event.startTime, prevEvent.overlapTime, event.gain);
      }
      
      if (!isLast) {
         const transStart = event.startTime + wallDuration - event.overlapTime;
         this.applyStemAutomation(event.technique, true, offlineCtx, strip, transStart, event.overlapTime, event.gain);

         // Loop Tail logic for techniques that benefit from extended outro (Echo/Loop)
         const needsLoopTail = [
           TransitionTechnique.LOOP_ECHO, 
           TransitionTechnique.ECHO_OUT, 
           TransitionTechnique.DROP_SWAP
         ].includes(event.technique);

         if (needsLoopTail && event.bufferLoopEnd > event.bufferLoopStart) {
             const loopSource = offlineCtx.createBufferSource();
             loopSource.buffer = event.buffer;
             loopSource.playbackRate.value = 1.0;
             loopSource.loop = true;
             loopSource.loopStart = event.bufferLoopStart;
             loopSource.loopEnd = event.bufferLoopEnd;
             loopSource.connect(strip.input);
             
             const mainEnd = event.startTime + wallDuration;
             
             // Extend tail by 8-16 seconds based on technique
             const tailLen = event.technique === TransitionTechnique.LOOP_ECHO ? 16 : 8;
             
             loopSource.start(mainEnd, event.bufferLoopStart);
             loopSource.stop(mainEnd + tailLen);
         }
      }
    }

    const renderedBuffer = await offlineCtx.startRendering();
    const wavBlob = this.bufferToWave(renderedBuffer, 0, renderedBuffer.length);

    return {
      blob: wavBlob,
      url: URL.createObjectURL(wavBlob),
      duration: renderedBuffer.duration,
      metadata: {
        transitionPoints: timelineEvents.map(e => e.startTime),
        style: config.style,
        techniquesUsed: timelineEvents.map(e => e.technique)
      }
    };
  }

  // --- STANDARD HELPERS ---

  private createChannelStrip(ctx: BaseAudioContext) {
    const lowEQ = ctx.createBiquadFilter();
    lowEQ.type = 'lowshelf';
    lowEQ.frequency.value = 200; 
    
    const highEQ = ctx.createBiquadFilter();
    highEQ.type = 'highshelf';
    highEQ.frequency.value = 2500; 

    const midPeaker = ctx.createBiquadFilter();
    midPeaker.type = 'peaking';
    midPeaker.frequency.value = 1000;
    midPeaker.Q.value = 0.5;
    midPeaker.gain.value = 0;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 22000; 
    filter.Q.value = 0.7;

    const channelGain = ctx.createGain();
    const auxSend = ctx.createGain();
    auxSend.gain.value = 0;

    lowEQ.connect(highEQ);
    highEQ.connect(midPeaker);
    midPeaker.connect(filter);
    filter.connect(channelGain);
    filter.connect(auxSend);

    return { input: lowEQ, lowEQ, midPeaker, highEQ, filter, channelGain, auxSend };
  }

  private createGlobalDelay(ctx: BaseAudioContext) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const delay = ctx.createDelay();
    const feedback = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    delay.delayTime.value = 0.36; // ~1/8th note at 125BPM roughly, tuned by ear for techno
    feedback.gain.value = 0.5;
    filter.type = 'lowpass';
    filter.frequency.value = 1000;

    input.connect(delay);
    delay.connect(feedback);
    feedback.connect(filter);
    filter.connect(delay);
    delay.connect(output);

    return { input, output };
  }

  private getOverlapBars(tech: TransitionTechnique): number {
    switch (tech) {
      case TransitionTechnique.HARD_CUT: return 0; // Immediate cut
      case TransitionTechnique.DROP_SWAP: return 8; 
      case TransitionTechnique.ECHO_OUT: return 4;
      case TransitionTechnique.LOOP_ECHO: return 8;
      case TransitionTechnique.FILTER_SWEEP: return 16;
      case TransitionTechnique.BASS_SWAP: return 32; 
      case TransitionTechnique.SLOW_EQ_BLEND: return 32;
      case TransitionTechnique.PHRASE_MIXING: return 32;
      case TransitionTechnique.LONG_BLEND: return 64; 
      default: return 32;
    }
  }

  private chooseTechnique(style: MixStyle): TransitionTechnique {
    const profile = STYLE_PROFILES[style];
    if (!profile) return TransitionTechnique.SLOW_EQ_BLEND;
    
    // Weighted Random Selection
    const totalWeight = profile.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const item of profile) {
      if (random < item.weight) return item.tech;
      random -= item.weight;
    }
    return TransitionTechnique.SLOW_EQ_BLEND;
  }

  private applyStemAutomation(
    tech: TransitionTechnique,
    isOutgoing: boolean,
    ctx: BaseAudioContext,
    strip: any,
    start: number,
    duration: number,
    baseGain: number
  ) {
    const end = start + duration;
    const { lowEQ, highEQ, filter, channelGain, auxSend } = strip;
    
    // Reset state for incoming track
    if (!isOutgoing) {
      channelGain.gain.setValueAtTime(0, start);
      lowEQ.gain.setValueAtTime(0, start);
      highEQ.gain.setValueAtTime(0, start);
      filter.frequency.setValueAtTime(22000, start);
      filter.type = 'lowpass';
      auxSend.gain.setValueAtTime(0, start);
    }

    switch (tech) {
      case TransitionTechnique.BASS_SWAP:
        const swapPoint = start + (duration * 0.75); 
        if (isOutgoing) {
          channelGain.gain.setValueAtTime(baseGain, start);
          channelGain.gain.setValueAtTime(baseGain, end - 1);
          channelGain.gain.linearRampToValueAtTime(0, end);
          lowEQ.gain.setValueAtTime(0, swapPoint - 0.1);
          lowEQ.gain.linearRampToValueAtTime(-40, swapPoint);
        } else {
          channelGain.gain.setValueAtTime(0, start);
          channelGain.gain.linearRampToValueAtTime(baseGain, start + 4);
          lowEQ.gain.setValueAtTime(-40, start);
          lowEQ.gain.setValueAtTime(-40, swapPoint);
          lowEQ.gain.linearRampToValueAtTime(0, swapPoint + 0.1);
        }
        break;
        
      case TransitionTechnique.LONG_BLEND: 
      case TransitionTechnique.PHRASE_MIXING:
        if (isOutgoing) {
            channelGain.gain.setValueAtTime(baseGain, start);
            channelGain.gain.linearRampToValueAtTime(0, end);
            lowEQ.gain.linearRampToValueAtTime(-40, end - 10);
            highEQ.gain.linearRampToValueAtTime(-10, end);
        } else {
            channelGain.gain.setValueAtTime(0, start);
            channelGain.gain.linearRampToValueAtTime(baseGain, end);
            lowEQ.gain.setValueAtTime(-40, start);
            lowEQ.gain.linearRampToValueAtTime(0, end);
        }
        break;

      case TransitionTechnique.FILTER_SWEEP:
        if (isOutgoing) {
          filter.type = 'highpass';
          filter.frequency.setValueAtTime(20, start);
          filter.frequency.exponentialRampToValueAtTime(8000, end);
          filter.Q.value = 4.0; // Resonant sweep
          channelGain.gain.setValueAtTime(baseGain, start);
          channelGain.gain.linearRampToValueAtTime(0, end);
        } else {
          channelGain.gain.setValueAtTime(0, start);
          channelGain.gain.linearRampToValueAtTime(baseGain, end);
        }
        break;

      case TransitionTechnique.ECHO_OUT:
      case TransitionTechnique.LOOP_ECHO:
        if (isOutgoing) {
          channelGain.gain.setValueAtTime(baseGain, start);
          // Ramp Delay Send
          auxSend.gain.setValueAtTime(0, end - 2); 
          auxSend.gain.linearRampToValueAtTime(1.0, end);
          // Hard volume cut at end
          channelGain.gain.setValueAtTime(baseGain, end - 0.1);
          channelGain.gain.exponentialRampToValueAtTime(0.001, end);
        } else {
          // Incoming starts fresh
          channelGain.gain.setValueAtTime(0, start);
          channelGain.gain.linearRampToValueAtTime(baseGain, start + 2);
        }
        break;

      case TransitionTechnique.DROP_SWAP:
        const dropPoint = start + (duration * 0.9);
        if (isOutgoing) {
            channelGain.gain.setValueAtTime(baseGain, start);
            channelGain.gain.setValueAtTime(baseGain, dropPoint);
            channelGain.gain.linearRampToValueAtTime(0, dropPoint + 0.1); // Instant Cut
        } else {
            channelGain.gain.setValueAtTime(0, start);
            channelGain.gain.setValueAtTime(0, dropPoint);
            channelGain.gain.linearRampToValueAtTime(baseGain, dropPoint + 0.1); // Instant Slam
        }
        break;

      default: // SLOW_EQ_BLEND
         if (isOutgoing) {
           channelGain.gain.setValueAtTime(baseGain, start);
           channelGain.gain.linearRampToValueAtTime(0, end);
         } else {
           channelGain.gain.setValueAtTime(0, start);
           channelGain.gain.linearRampToValueAtTime(baseGain, end);
         }
    }
  }

  private async loadBuffer(file: File, ctx: BaseAudioContext): Promise<AudioBuffer> {
    const arrayBuffer = await file.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuffer); 
  }

  private bufferToWave(abuffer: AudioBuffer, offset: number, len: number): Blob {
    let numOfChan = abuffer.numberOfChannels,
        length = len * numOfChan * 2 + 44,
        buffer = new ArrayBuffer(length),
        view = new DataView(buffer),
        channels = [], i, sample,
        pos = 0;

    // WAV Header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8);
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt "
    setUint32(16);
    setUint16(1); // PCM
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);
    setUint32(0x61746164); // "data"
    setUint32(length - pos - 4);

    for(i = 0; i < abuffer.numberOfChannels; i++)
      channels.push(abuffer.getChannelData(i));

    while(pos < length) {
      for(i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0;
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([buffer], {type: "audio/wav"});

    function setUint16(data: any) { view.setUint16(pos, data, true); pos += 2; }
    function setUint32(data: any) { view.setUint32(pos, data, true); pos += 4; }
  }
}

export const mixEngine = new MixEngine();