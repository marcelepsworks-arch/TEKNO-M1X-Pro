export enum MixStyle {
  CAROLA = 'Marco Carola (Minimal/Groove)',
  MILLS = 'Jeff Mills (Purist/Techno)',
  GARNIER = 'Laurent Garnier (Storyteller)',
  SANCHEZ = 'Roger Sanchez (House/Vocal)',
  SOLOMUN = 'Solomun (Melodic/Build)',
  SIMS = 'Ben Sims (Tribal/Cuts)',
  MAY = 'Derrick May (Detroit/Rhythm)'
}

export enum TransitionTechnique {
  PHRASE_MIXING = 'Phrase Mixing',
  HARMONIC_MIXING = 'Harmonic Mixing',
  SLOW_EQ_BLEND = 'Slow EQ Blending',
  BASS_SWAP = 'Bass Swap',
  FILTER_SWEEP = 'Filter Sweep',
  ECHO_OUT = 'Echo Out',
  REVERB_WASH = 'Reverb Wash',
  DELAY_THROW = 'Delay Throw',
  DROP_SWAP = 'Drop Swap',
  LONG_BLEND = 'Long Blend/Overlay',
  HARD_CUT = 'Hard Cut',
  LOOP_ECHO = 'Looping & Echo',
  ACAPELLA_LAYER = 'Vocal Layering'
}

export interface BeatGrid {
  bpm: number;
  offset: number; // ms to first downbeat
  beats: number[]; // timestamps of beats
  downbeats: number[]; // timestamps of "The One" (every 4 bars)
}

export interface EnergyProfile {
  low: number[]; // Bass energy over time
  mid: number[];
  high: number[];
}

export interface CuePoints {
  start: number; // Best point to start track (usually first beat or intro phrase)
  end: number;   // Best point to mix out (energy drop or phrase end)
  loopRegion: { start: number; end: number }; // A safe 4-bar loop region for extending the mix
}

export interface TrackMetadata {
  id: string;
  file: File;
  name: string;
  duration: number; // seconds
  originalBpm: number;
  key: string; // Camelot notation
  beatGrid: BeatGrid;
  energyProfile: EnergyProfile;
  cuePoints: CuePoints;
  gainFactor: number; // Volume normalization factor
  grooveIndex: number; // 0-100 rating of rhythmic dynamic range
  confidence: number; // 0-1.0 confidence in beat detection
  status: 'PENDING' | 'ANALYZING' | 'READY' | 'ERROR';
  playbackRatio: number; // Ratio to hit 125 BPM
}

export interface MixConfiguration {
  style: MixStyle;
  targetBpm: number;
  transitionLengthBars: number; // 8, 16, 32
}

export interface MixResult {
  blob: Blob;
  url: string;
  duration: number;
  metadata: {
    transitionPoints: number[];
    style: MixStyle;
    techniquesUsed: string[];
  };
}