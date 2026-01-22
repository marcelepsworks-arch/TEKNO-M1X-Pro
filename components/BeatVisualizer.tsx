import React, { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';

interface Props {
  audioUrl: string;
  bpm: number;
}

const BeatVisualizer: React.FC<Props> = ({ audioUrl, bpm }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false); // [UI-UX] Guard against early interactions
  const [zoom, setZoom] = useState(50); // px per second
  const [currentTime, setCurrentTime] = useState(0);

  // Calculate Grid Spacing
  const beatDuration = 60 / bpm; // 0.48s for 125 BPM
  const barDuration = beatDuration * 4; // 1.92s

  // Calculate CSS background size for the grid
  // beatWidth (px) = zoom (px/s) * beatDuration (s)
  const beatWidthPx = zoom * beatDuration;
  const barWidthPx = zoom * barDuration;

  useEffect(() => {
    if (!containerRef.current || !audioUrl) return;

    setIsReady(false);
    
    // Destroy previous instance
    if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
    }

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#555',
      progressColor: '#00E5FF',
      cursorColor: '#fff',
      barWidth: 2,
      barGap: 1,
      height: 128,
      minPxPerSec: zoom,
      autoScroll: true,
      interact: true,
      normalize: true,
    });

    try {
        ws.load(audioUrl);
    } catch (e) {
        console.error("WaveSurfer load error:", e);
    }

    ws.on('ready', () => {
      console.log('[Visualizer] Waveform Ready');
      setIsReady(true);
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('timeupdate', (time) => setCurrentTime(time));

    wavesurferRef.current = ws;

    return () => {
      ws.destroy();
      setIsReady(false);
    };
  }, [audioUrl]); // Re-init on new URL

  useEffect(() => {
    if (wavesurferRef.current && isReady) {
      wavesurferRef.current.zoom(zoom);
    }
  }, [zoom, isReady]);

  const togglePlay = useCallback(() => {
    if (wavesurferRef.current && isReady) {
      wavesurferRef.current.playPause();
    }
  }, [isReady]);

  return (
    <div className="w-full flex flex-col gap-4 bg-[#1a1a1a] p-4 rounded-xl border border-gray-800 shadow-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={togglePlay}
            disabled={!isReady}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all 
               ${!isReady ? 'bg-gray-700 cursor-not-allowed text-gray-500' : 'bg-[#00E5FF] text-black hover:bg-[#80f2ff]'}`}
          >
            {isPlaying ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            )}
          </button>
          <div className="flex flex-col">
             <span className="text-xs text-gray-500 uppercase tracking-wider font-bold">Playback</span>
             <span className="font-mono text-[#00E5FF]">{currentTime.toFixed(2)}s</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
           <span className="text-xs text-gray-500 uppercase font-bold">Zoom</span>
           <input 
             type="range" 
             min="10" 
             max="200" 
             value={zoom} 
             disabled={!isReady}
             onChange={(e) => setZoom(Number(e.target.value))}
             className="w-32 accent-[#00E5FF] disabled:opacity-50"
           />
        </div>
      </div>

      {/* Visualizer Container */}
      <div className="relative h-32 w-full bg-[#111] rounded overflow-hidden border border-gray-700">
        
        {/* CSS Grid Layer */}
        <div 
           className="absolute inset-0 z-10 pointer-events-none"
           style={{
             backgroundImage: `
               linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px),
               linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
             `,
             backgroundSize: `${barWidthPx}px 100%, ${beatWidthPx}px 100%`,
             backgroundPosition: '0 0' // Assuming mix starts at 0.0s aligned
           }}
        ></div>
        
        {/* Loading Overlay */}
        {!isReady && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="text-xs text-[#00E5FF] font-mono animate-pulse">LOADING WAVEFORM...</div>
            </div>
        )}
        
        {/* WaveSurfer Mount Point */}
        <div ref={containerRef} className="absolute inset-0 z-0" />
      </div>

      <div className="flex justify-between text-[10px] text-gray-500 font-mono uppercase">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 border-r border-white/20 bg-transparent"></div>
          <span>Beat Grid ({(60/bpm).toFixed(2)}s)</span>
        </div>
        <div className="flex items-center gap-2">
           <div className="w-3 h-3 border-r border-white/60 bg-transparent"></div>
           <span>Downbeat ({((60/bpm)*4).toFixed(2)}s)</span>
        </div>
      </div>
    </div>
  );
};

export default BeatVisualizer;