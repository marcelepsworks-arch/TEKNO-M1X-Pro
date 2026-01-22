import React, { useState } from 'react';
import { TrackMetadata } from '../types';
import TrackAnalysisDetail from './TrackAnalysisDetail';

interface Props {
  tracks: TrackMetadata[];
}

const TrackList: React.FC<Props> = ({ tracks }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <div className="bg-[#1a1a1a] rounded-xl border border-gray-800 overflow-hidden shadow-2xl">
      <div className="bg-[#222] px-6 py-3 border-b border-gray-800 flex text-xs font-semibold text-gray-400 uppercase tracking-wider">
        <div className="w-12">#</div>
        <div className="flex-1">Track Name</div>
        <div className="w-20 text-center">BPM</div>
        <div className="w-20 text-center">Key</div>
        <div className="w-24 text-right">Status</div>
      </div>
      <div className="divide-y divide-gray-800">
        {tracks.length === 0 ? (
          <div className="p-8 text-center text-gray-500 italic">No tracks uploaded yet.</div>
        ) : (
          tracks.map((track, idx) => (
            <div key={track.id} className="flex flex-col group transition-colors">
              {/* Main Row */}
              <div 
                className={`px-6 py-4 flex items-center cursor-pointer transition-colors ${expandedId === track.id ? 'bg-[#2a2a2a]' : 'hover:bg-[#252525]'}`}
                onClick={() => track.status === 'READY' && toggleExpand(track.id)}
              >
                <div className="w-12 text-gray-500 font-mono text-sm">{idx + 1}</div>
                <div className="flex-1">
                  <div className="font-medium text-gray-200 truncate pr-4 flex items-center gap-2">
                    {track.name}
                    {track.status === 'READY' && (
                       <svg className={`w-4 h-4 text-gray-500 transition-transform ${expandedId === track.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                       </svg>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 flex gap-2">
                    <span>{(track.duration / 60).toFixed(2)}m</span>
                    {track.status === 'READY' && (
                      <span className="text-[#00E5FF]">Target: 125 BPM</span>
                    )}
                  </div>
                </div>
                <div className="w-20 text-center text-sm font-mono text-gray-300">
                  {track.originalBpm > 0 ? track.originalBpm : '-'}
                </div>
                <div className="w-20 text-center text-sm font-mono text-[#00E5FF]">
                  {track.key || '-'}
                </div>
                <div className="w-24 text-right">
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                    track.status === 'READY' ? 'bg-green-900/30 text-green-400' :
                    track.status === 'ANALYZING' ? 'bg-blue-900/30 text-blue-400 animate-pulse' :
                    'bg-gray-800 text-gray-500'
                  }`}>
                    {track.status}
                  </span>
                </div>
              </div>

              {/* Detailed View */}
              {expandedId === track.id && track.status === 'READY' && (
                 <TrackAnalysisDetail track={track} />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TrackList;