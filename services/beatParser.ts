import { BeatGrid } from '../types';

// [DSP-SPECIALIST]
// Implementation of Beat Parsing Logic based on the principles of @sw6820/beat-parser-core.
// This module cleans up raw onset data (jittery) into a mathematically perfect grid (Phase-Locked).

export class BeatParser {
  /**
   * Corrects the raw beats detected by Essentia into a strict grid.
   * @param rawBeats - Array of timestamps (seconds) where beats were detected.
   * @param detectedBpm - The BPM detected by the algorithm.
   * @param totalDuration - The total duration of the audio file in seconds.
   * @param forcedOffset - (Optional) Precision offset from external detector (e.g. web-audio-beat-detector).
   */
  static getLockedGrid(rawBeats: number[], detectedBpm: number, totalDuration: number, forcedOffset: number = -1): BeatGrid {
    
    // 1. Calculate the ideal Beat Interval (Seconds per beat)
    const idealInterval = 60 / detectedBpm;
    let averageOffset = 0;

    // 2. Determine Phase (Offset)
    if (forcedOffset >= 0) {
        // [HYBRID SYNC] Use the external high-precision offset
        averageOffset = forcedOffset;
    } else if (rawBeats.length >= 2) {
        // [STATISTICAL SYNC] Fallback to Essentia averages
        let phaseSum = 0;
        const sampleSize = Math.min(rawBeats.length, 32); 
        for (let i = 0; i < sampleSize; i++) {
          phaseSum += (rawBeats[i] - (i * idealInterval));
        }
        averageOffset = phaseSum / sampleSize;
    }

    // 3. Generate the "Perfect" Grid covering the WHOLE duration
    const lockedBeats: number[] = [];
    const downbeats: number[] = [];

    // Normalize t to be the first beat >= 0
    let t = averageOffset;
    while (t < 0) t += idealInterval;
    while (t > idealInterval) t -= idealInterval; 

    // If using forcedOffset, we treat t as "Beat 0" (Downbeat)
    // If statistical, we might need alignment, but usually the first beat is a downbeat in house/techno starts.
    let beatCount = 0;

    while (t < totalDuration) {
      lockedBeats.push(t);
      
      // Identify "The One" (Downbeat) - Every 4 beats
      if (beatCount % 4 === 0) {
        downbeats.push(t);
      }
      t += idealInterval;
      beatCount++;
    }

    return {
      bpm: detectedBpm,
      offset: averageOffset * 1000,
      beats: lockedBeats,
      downbeats: downbeats
    };
  }
}