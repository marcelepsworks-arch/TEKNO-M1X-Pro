import React, { useMemo } from 'react';
import { TrackMetadata } from '../types';

interface Props {
  track: TrackMetadata;
}

const TrackAnalysisDetail: React.FC<Props> = ({ track }) => {
  const { energyProfile, cuePoints, duration, grooveIndex, confidence, beatGrid } = track;

  // Format seconds to mm:ss
  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Interpret Groove Index
  const getGrooveDescription = (index: number) => {
    if (index < 30) return 'Mechanical / Straight';
    if (index < 60) return 'Natural / Loose';
    if (index < 85) return 'Swing / House';
    return 'Heavy Groove / Syncopated';
  };

  // Generate SVG Path for Energy Profile
  const generatePath = (data: number[]) => {
    if (!data.length) return '';
    const points = data.map((val, idx) => {
      const x = (idx / (data.length - 1)) * 100;
      // Normalize and amplify slightly for visualization
      const v = Math.min(val * 1.8, 1); 
      const y = 100 - (v * 100);
      return `${x},${y}`;
    });
    return `M0,100 L${points.join(' L')} L100,100 Z`; // Fill to bottom
  };

  const lowPath = useMemo(() => generatePath(energyProfile.low), [energyProfile]);

  // Percentages for markers
  const startPct = (cuePoints.start / duration) * 100;
  const endPct = (cuePoints.end / duration) * 100;
  const loopStartPct = (cuePoints.loopRegion.start / duration) * 100;
  const loopEndPct = (cuePoints.loopRegion.end / duration) * 100;

  return (
    <div className="bg-[#151515] border-t border-b border-gray-800 p-6 animate-in fade-in slide-in-from-top-2 duration-300 shadow-inner">
      
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Left Column: Deep Metrics */}
        <div className="col-span-1 md:col-span-3 space-y-6 border-r border-gray-800 pr-4">
           <div>
             <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-2">Rhythmic Character</div>
             <div className="text-white font-medium text-sm mb-1">{getGrooveDescription(grooveIndex)}</div>
             <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-[#00E5FF]" style={{ width: `${grooveIndex}%` }}></div>
                </div>
                <span className="text-xs font-mono text-gray-400">{grooveIndex}</span>
             </div>
           </div>
           
           <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#1a1a1a] p-2 rounded border border-gray-800">
                <div className="text-[9px] text-gray-500 uppercase font-bold mb-1">Grid Phase</div>
                <div className="font-mono text-[#00E5FF] text-lg">{beatGrid.offset.toFixed(1)}<span className="text-[10px] text-gray-500 ml-0.5">ms</span></div>
              </div>
              <div className="bg-[#1a1a1a] p-2 rounded border border-gray-800">
                 <div className="text-[9px] text-gray-500 uppercase font-bold mb-1">Confidence</div>
                 <div className={`font-mono text-lg ${confidence > 0.8 ? 'text-green-400' : 'text-yellow-400'}`}>
                   {(confidence * 100).toFixed(0)}<span className="text-[10px] text-gray-500 ml-0.5">%</span>
                 </div>
              </div>
           </div>

           <div>
              <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-2">Sync Engine</div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                 <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                 <span>Locked @ {track.originalBpm} BPM</span>
              </div>
           </div>
        </div>

        {/* Center/Right: Visualization & Cues */}
        <div className="col-span-1 md:col-span-9 flex flex-col justify-between gap-4">
           
           {/* Graph */}
           <div className="relative h-32 w-full bg-[#0a0a0a] rounded border border-gray-800 overflow-hidden group">
              {/* Grid Lines */}
              <div className="absolute inset-0 opacity-10 pointer-events-none" 
                   style={{ backgroundImage: 'linear-gradient(to right, #333 1px, transparent 1px)', backgroundSize: '10% 100%' }}></div>

              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full absolute inset-0">
                {/* Low Energy Fill */}
                <path d={lowPath} fill="url(#gradLow)" stroke="rgba(219, 39, 119, 0.5)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                <defs>
                  <linearGradient id="gradLow" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="rgba(219, 39, 119, 0.8)" />
                    <stop offset="100%" stopColor="rgba(219, 39, 119, 0.0)" />
                  </linearGradient>
                </defs>
              </svg>
              
              {/* Markers Overlay */}
              
              {/* Start */}
              <div className="absolute top-0 bottom-0 w-px bg-green-500 z-10 shadow-[0_0_8px_rgba(34,197,94,0.8)]" style={{ left: `${startPct}%` }}>
                 <div className="absolute top-2 left-1 text-[9px] text-green-500 font-bold bg-black/80 px-1 rounded backdrop-blur-sm">IN</div>
              </div>

              {/* Loop Region */}
              <div className="absolute top-0 bottom-0 bg-yellow-500/10 border-x border-yellow-500/30 z-0" 
                  style={{ left: `${loopStartPct}%`, width: `${loopEndPct - loopStartPct}%` }}>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] text-yellow-500 font-bold bg-black/50 px-1 rounded whitespace-nowrap">LOOP EXT.</div>
              </div>

              {/* End */}
              <div className="absolute top-0 bottom-0 w-px bg-red-500 z-10 shadow-[0_0_8px_rgba(239,68,68,0.8)]" style={{ left: `${endPct}%` }}>
                 <div className="absolute top-2 right-1 text-[9px] text-red-500 font-bold bg-black/80 px-1 rounded backdrop-blur-sm">OUT</div>
              </div>
           </div>

           {/* Cue Points Grid */}
           <div className="grid grid-cols-3 gap-4">
              <div className="bg-[#1a1a1a] p-3 rounded border border-gray-800 flex flex-col items-center relative overflow-hidden group hover:border-green-500/50 transition-colors">
                 <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
                 <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Entry Point</span>
                 <span className="text-xl font-mono text-white tracking-tight">{formatTime(cuePoints.start)}</span>
                 <span className="text-[9px] text-gray-600 mt-1">Bar 1</span>
              </div>
              
              <div className="bg-[#1a1a1a] p-3 rounded border border-gray-800 flex flex-col items-center relative overflow-hidden group hover:border-yellow-500/50 transition-colors">
                 <div className="absolute top-0 left-0 w-1 h-full bg-yellow-500"></div>
                 <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Safety Loop</span>
                 <span className="text-xl font-mono text-white tracking-tight">{formatTime(cuePoints.loopRegion.start)}</span>
                 <span className="text-[9px] text-gray-600 mt-1">4 Bars Duration</span>
              </div>

              <div className="bg-[#1a1a1a] p-3 rounded border border-gray-800 flex flex-col items-center relative overflow-hidden group hover:border-red-500/50 transition-colors">
                 <div className="absolute top-0 right-0 w-1 h-full bg-red-500"></div>
                 <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Mix Out</span>
                 <span className="text-xl font-mono text-white tracking-tight">{formatTime(cuePoints.end)}</span>
                 <span className="text-[9px] text-gray-600 mt-1">Energy Drop</span>
              </div>
           </div>

        </div>
      </div>
    </div>
  );
};

export default TrackAnalysisDetail;