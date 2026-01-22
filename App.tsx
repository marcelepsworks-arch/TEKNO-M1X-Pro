import React, { useState, useRef, useCallback } from 'react';
import { TrackMetadata, MixStyle, MixResult } from './types';
import { analysisEngine } from './services/analysis';
import { mixEngine } from './services/mixEngine';
import TrackList from './components/TrackList';
import BeatVisualizer from './components/BeatVisualizer';

const STEPS = ['Upload', 'Analyze', 'Configure', 'Export'];

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [tracks, setTracks] = useState<TrackMetadata[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [processLog, setProcessLog] = useState<string>('');
  const [selectedStyle, setSelectedStyle] = useState<MixStyle>(MixStyle.CAROLA);
  const [mixResult, setMixResult] = useState<MixResult | null>(null);
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newTracks: TrackMetadata[] = Array.from(e.target.files).map((file: File) => ({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        duration: 0,
        originalBpm: 0,
        key: '',
        beatGrid: { bpm: 0, offset: 0, beats: [], downbeats: [] },
        energyProfile: { low: [], mid: [], high: [] },
        cuePoints: { start: 0, end: 0, loopRegion: { start: 0, end: 0 } },
        gainFactor: 1,
        grooveIndex: 0,
        confidence: 0,
        status: 'PENDING',
        playbackRatio: 1
      }));
      setTracks(prev => [...prev, ...newTracks]);
    }
  };

  const startAnalysis = async () => {
    setIsProcessing(true);
    setAnalysisComplete(false);
    setCurrentStep(1);
    setProcessLog('Initializing Essentia.js WASM + BeatParser...');
    
    const analyzedTracks = [...tracks];
    
    try {
      for (let i = 0; i < analyzedTracks.length; i++) {
        if (analyzedTracks[i].status === 'PENDING') {
          setProcessLog(`Analyzing & Gridding: ${analyzedTracks[i].name}...`);
          analyzedTracks[i].status = 'ANALYZING';
          setTracks([...analyzedTracks]); 

          try {
            const metadata = await analysisEngine.analyzeTrack(analyzedTracks[i].file, analyzedTracks[i].id);
            analyzedTracks[i] = metadata;
          } catch (err) {
            console.error(`Error analyzing ${analyzedTracks[i].name}:`, err);
            analyzedTracks[i].status = 'ERROR';
            setProcessLog(`Error on ${analyzedTracks[i].name}: ${(err as Error).message}`);
          }
          setTracks([...analyzedTracks]);
        }
      }
      setProcessLog('Analysis Complete. Review Playlist.');
      setAnalysisComplete(true);
    } catch (globalErr) {
      console.error("Critical Engine Failure", globalErr);
      setProcessLog(`Critical Error: ${(globalErr as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const generateMix = async () => {
    // Check if we have valid tracks
    const readyTracks = tracks.filter(t => t.status === 'READY');
    if (readyTracks.length === 0) {
      setProcessLog("Error: No valid tracks to mix. Check analysis results.");
      return;
    }

    setIsProcessing(true);
    setProcessLog('Initializing OfflineAudioContext...');
    
    try {
      const result = await mixEngine.renderMix(tracks, {
        style: selectedStyle,
        targetBpm: 125,
        transitionLengthBars: 32
      });
      setMixResult(result);
      setCurrentStep(3);
    } catch (e) {
      console.error(e);
      setProcessLog(`Error rendering mix: ${(e as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] text-gray-200 flex flex-col font-sans selection:bg-[#00E5FF] selection:text-black">
      {/* Header */}
      <header className="border-b border-gray-800 bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#00E5FF] rounded-full animate-pulse shadow-[0_0_10px_#00E5FF]"></div>
            <h1 className="text-xl font-bold tracking-tight text-white">TEKNO-M1X <span className="text-[#00E5FF] font-light">PRO</span></h1>
          </div>
          <div className="flex gap-1 text-xs font-mono text-gray-500">
             <span>DSP: ESSENTIA + BEATPARSER</span>
             <span className="mx-2">|</span>
             <span>SYNC: 125.00</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 flex gap-8">
        
        {/* Left Panel: Sidebar / Workflow */}
        <div className="w-1/4 flex flex-col gap-6">
          <div className="bg-[#1a1a1a] rounded-xl p-6 border border-gray-800 shadow-xl">
            <h2 className="text-sm font-semibold text-gray-400 uppercase mb-4 tracking-wider">Workflow</h2>
            <div className="space-y-4 relative">
              {/* Vertical Line */}
              <div className="absolute left-[11px] top-2 bottom-2 w-[1px] bg-gray-700 z-0"></div>
              
              {STEPS.map((step, idx) => (
                <div key={step} className={`relative z-10 flex items-center gap-3 ${idx === currentStep ? 'text-white' : 'text-gray-600'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300
                    ${idx === currentStep ? 'border-[#00E5FF] bg-[#00E5FF]/10 text-[#00E5FF]' : 
                      idx < currentStep ? 'border-green-500 bg-green-500 text-black border-transparent' : 'border-gray-700 bg-[#121212]'}`}>
                    {idx < currentStep ? '✓' : idx + 1}
                  </div>
                  <span className={`text-sm font-medium ${idx === currentStep ? 'text-[#00E5FF]' : ''}`}>{step}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#1a1a1a] rounded-xl p-6 border border-gray-800 shadow-xl flex-1">
            <h2 className="text-sm font-semibold text-gray-400 uppercase mb-4 tracking-wider">Controls</h2>
            
            {/* Step 0: Upload */}
            {currentStep === 0 && (
               <div className="flex flex-col gap-4">
                 <div className="relative group h-32 w-full">
                   <input 
                     type="file" 
                     multiple 
                     accept="audio/*" 
                     onChange={handleFileUpload} 
                     className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                   />
                   <div className="absolute inset-0 border-2 border-dashed border-gray-700 rounded-lg p-4 text-center flex flex-col items-center justify-center group-hover:border-[#00E5FF] transition-colors bg-[#151515] z-10 pointer-events-none">
                     <p className="text-gray-400 group-hover:text-white transition-colors text-sm">Drag MP3s here</p>
                     <p className="text-[10px] text-gray-600 mt-1">Underground Techno/House</p>
                   </div>
                 </div>
                 
                 {tracks.length > 0 && (
                   <button 
                    onClick={startAnalysis}
                    className="w-full bg-[#00E5FF] text-black font-bold py-3 rounded hover:bg-[#5ff0ff] transition-all shadow-[0_0_15px_rgba(0,229,255,0.3)] z-30">
                     START ANALYSIS
                   </button>
                 )}
               </div>
            )}

            {/* Step 1: Analysis Progress */}
            {currentStep === 1 && (
               <div className="flex flex-col gap-4 justify-center h-full">
                  <div className="text-center">
                    {isProcessing ? (
                      <div className="w-12 h-12 border-4 border-[#00E5FF] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    ) : (
                      <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 text-black text-2xl font-bold">✓</div>
                    )}
                    <h3 className="text-white font-medium">{isProcessing ? 'Analyzing...' : 'Analysis Complete'}</h3>
                    <p className="text-xs text-gray-500 mt-2">{processLog}</p>
                  </div>

                  {!isProcessing && analysisComplete && (
                    <button 
                      onClick={() => setCurrentStep(2)}
                      className="w-full bg-[#00E5FF] text-black font-bold py-3 rounded hover:bg-[#5ff0ff] transition-all shadow-[0_0_15px_rgba(0,229,255,0.3)] mt-4">
                      CONFIGURE PLAYLIST
                    </button>
                  )}
               </div>
            )}

            {/* Step 2: Configuration */}
            {currentStep === 2 && (
              <div className="space-y-6">
                 <div>
                   <label className="text-xs text-gray-500 uppercase font-bold block mb-2">DJ Style / Artist Profile</label>
                   <div className="grid grid-cols-1 gap-2 h-64 overflow-y-auto pr-2 custom-scrollbar">
                     {Object.values(MixStyle).map((style) => (
                       <button
                         key={style}
                         onClick={() => setSelectedStyle(style)}
                         className={`px-4 py-3 rounded text-left text-sm border transition-all flex flex-col
                           ${selectedStyle === style 
                             ? 'border-[#00E5FF] bg-[#00E5FF]/10 text-white' 
                             : 'border-gray-800 bg-[#222] text-gray-400 hover:bg-[#2a2a2a]'}`}
                       >
                         <span className="font-bold">{style.split('(')[0]}</span>
                         <span className="text-xs opacity-60">({style.split('(')[1]}</span>
                       </button>
                     ))}
                   </div>
                 </div>
                 <button 
                   onClick={generateMix}
                   disabled={isProcessing}
                   className="w-full bg-[#00E5FF] text-black font-bold py-3 rounded hover:bg-[#5ff0ff] transition-all shadow-[0_0_15px_rgba(0,229,255,0.3)] disabled:opacity-50 disabled:cursor-not-allowed">
                   {isProcessing ? 'RENDERING...' : 'CREATE MIX'}
                 </button>
              </div>
            )}
            
            {/* Step 3: Export */}
            {currentStep === 3 && mixResult && (
              <div className="space-y-4">
                <a 
                  href={mixResult.url} 
                  download="TEKNO-MIX-PRO_SESSION.wav"
                  className="block w-full bg-green-500 text-black font-bold py-3 rounded text-center hover:bg-green-400 transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)]">
                  DOWNLOAD WAV
                </a>
                <button
                   onClick={() => {
                     setCurrentStep(0);
                     setTracks([]);
                     setMixResult(null);
                     setAnalysisComplete(false);
                   }}
                   className="block w-full border border-gray-700 text-gray-400 py-3 rounded hover:text-white hover:border-white transition-all">
                  START NEW SESSION
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Data / Waveforms */}
        <div className="flex-1 flex flex-col gap-6">
          {/* Status Bar */}
          <div className="bg-[#1a1a1a] h-12 rounded-lg flex items-center px-4 border border-gray-800 justify-between">
             <div className="flex items-center gap-3">
               <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-yellow-400 animate-bounce' : 'bg-gray-600'}`}></div>
               <span className="text-xs font-mono text-gray-400">{processLog || 'System Idle'}</span>
             </div>
             <div className="text-xs font-mono text-gray-600">
               CORE-ARCHITECT v1.0
             </div>
          </div>

          {/* Visualization Area */}
          <div className="flex-1 bg-[#0f0f0f] rounded-xl border border-gray-800 relative overflow-hidden flex flex-col">
            {currentStep === 3 && mixResult ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-12 space-y-8">
                {/* Replaced Mock Waveform with Real BeatVisualizer */}
                <BeatVisualizer audioUrl={mixResult.url} bpm={125} />
                
                <div className="grid grid-cols-3 gap-4 w-full">
                  <div className="bg-[#1a1a1a] p-4 rounded border border-gray-800">
                    <div className="text-xs text-gray-500 uppercase">Style</div>
                    <div className="text-sm text-white">{selectedStyle.split('(')[0]}</div>
                  </div>
                  <div className="bg-[#1a1a1a] p-4 rounded border border-gray-800">
                    <div className="text-xs text-gray-500 uppercase">Duration</div>
                    <div className="text-lg text-white">{(mixResult.duration / 60).toFixed(2)}m</div>
                  </div>
                  <div className="bg-[#1a1a1a] p-4 rounded border border-gray-800">
                    <div className="text-xs text-gray-500 uppercase">Techniques</div>
                    <div className="text-xs text-green-400 overflow-hidden text-ellipsis whitespace-nowrap">
                       {mixResult.metadata.techniquesUsed?.slice(0,3).join(', ') || 'Auto'}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 h-full flex flex-col">
                 <div className="flex justify-between items-end mb-4">
                    <h3 className="text-lg font-medium text-white">Session Tracks</h3>
                    <span className="text-xs text-gray-500 uppercase tracking-widest">{tracks.length} Files Loaded</span>
                 </div>
                 <div className="flex-1 overflow-auto">
                    <TrackList tracks={tracks} />
                 </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;