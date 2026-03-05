import React, { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { Play, Pause, Square, SkipBack, SkipForward, Clock } from 'lucide-react';

export const Timeline: React.FC = () => {
  const { project, currentTime, setCurrentTime, isPlaying, setIsPlaying } = useStore();
  const { objects, duration } = project;
  const requestRef = useRef<number>(null);
  const lastTimeRef = useRef<number>(0);

  const animate = (time: number) => {
    if (lastTimeRef.current !== undefined) {
      const deltaTime = (time - lastTimeRef.current) / 1000;
      if (isPlaying) {
        let nextTime = currentTime + deltaTime;
        if (nextTime >= duration) {
          nextTime = 0;
        }
        setCurrentTime(nextTime);
      }
    }
    lastTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, currentTime, duration]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentTime(parseFloat(e.target.value));
  };

  const formatTime = (t: number) => t.toFixed(2);

  return (
    <div className="h-24 sm:h-32 landscape:h-20 bg-zinc-950 border-t border-zinc-800 flex flex-col text-zinc-300 transition-all">
      <div className="flex items-center px-4 py-1 sm:py-2 border-b border-zinc-900 justify-between">
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-0.5 sm:gap-1">
            <button onClick={() => setCurrentTime(0)} className="p-1 sm:p-1.5 hover:bg-zinc-800 rounded text-zinc-500 hover:text-white"><SkipBack size={14} className="sm:w-4 sm:h-4" /></button>
            <button onClick={() => setIsPlaying(!isPlaying)} className="p-1.5 sm:p-2 bg-indigo-600 hover:bg-indigo-500 rounded-full text-white">
              {isPlaying ? <Pause size={16} fill="currentColor" className="sm:w-4 sm:h-4" /> : <Play size={16} fill="currentColor" className="ml-0.5 sm:w-4 sm:h-4" />}
            </button>
            <button onClick={() => { setIsPlaying(false); setCurrentTime(0); }} className="p-1 sm:p-1.5 hover:bg-zinc-800 rounded text-zinc-500 hover:text-white"><Square size={14} fill="currentColor" className="sm:w-4 sm:h-4" /></button>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 font-mono text-[10px] sm:text-xs text-zinc-500">
            <Clock size={12} className="sm:w-3.5 sm:h-3.5" />
            <span className="text-white">{formatTime(currentTime)}s</span>
            <span className="hidden xs:inline">/</span>
            <span className="hidden xs:inline">{duration}s</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-[9px] sm:text-[10px] uppercase font-bold text-zinc-600 tracking-widest hidden sm:block">Línea de Tiempo</span>
        </div>
      </div>

      <div className="flex-1 relative px-4 py-1 sm:py-4 flex flex-col justify-center">
        {/* Keyframe markers */}
        <div className="absolute inset-x-4 top-0 h-full pointer-events-none">
          {objects.map(obj => 
            (obj.keyframes || []).map(kf => (
              <div 
                key={kf.id}
                className="absolute w-2 h-2 bg-indigo-500 rotate-45 top-1/2 -translate-y-1/2"
                style={{ left: `${(kf.time / duration) * 100}%` }}
              />
            ))
          )}
        </div>

        <input 
          type="range" 
          min={0} 
          max={duration} 
          step={0.01} 
          value={currentTime}
          onChange={handleSliderChange}
          className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 relative z-10"
        />
        
        <div className="flex justify-between mt-2 text-[10px] font-mono text-zinc-600">
          {Array.from({ length: Math.floor(duration) + 1 }).map((_, i) => (
            <span key={i}>{i}s</span>
          ))}
        </div>
      </div>
    </div>
  );
};
