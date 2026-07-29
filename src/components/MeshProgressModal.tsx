import React from 'react';
import { useStore } from '../store/useStore';
import { Layers, Loader2, Sparkles, Box, Cpu } from 'lucide-react';

export const MeshProgressModal: React.FC = () => {
  const meshProcessing = useStore(state => state.meshProcessing);

  if (!meshProcessing || !meshProcessing.active) return null;

  const { title, subtitle, progress, objectName, vertCount, faceCount } = meshProcessing;
  const clampedProgress = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md bg-zinc-900/95 border border-zinc-700/80 rounded-2xl p-6 shadow-2xl text-white relative overflow-hidden"
        style={{
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 30px rgba(99, 102, 241, 0.15)',
        }}
      >
        {/* Top decorative gradient line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 via-indigo-500 to-purple-500 animate-pulse" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 relative">
              <Loader2 size={22} className="animate-spin text-indigo-400" />
              <Sparkles size={10} className="absolute -top-1 -right-1 text-teal-400 animate-ping" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-100 tracking-wide flex items-center gap-2">
                {title}
              </h3>
              {objectName && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Box size={11} className="text-zinc-400" />
                  <span className="text-[11px] font-semibold text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded-md border border-zinc-700/50">
                    {objectName}
                  </span>
                </div>
              )}
            </div>
          </div>

          <span className="text-lg font-extrabold font-mono text-indigo-400 bg-indigo-950/50 px-2.5 py-1 rounded-lg border border-indigo-800/40">
            {clampedProgress}%
          </span>
        </div>

        {/* Subtitle / Status text */}
        <p className="text-xs text-zinc-300 font-medium mb-3 min-h-[1.5rem] flex items-center gap-2">
          <Cpu size={13} className="text-teal-400 animate-pulse shrink-0" />
          <span className="truncate">{subtitle || 'Procesando algoritmo de geometría...'}</span>
        </p>

        {/* Progress bar container */}
        <div className="relative w-full h-3 bg-zinc-800/90 rounded-full overflow-hidden border border-zinc-700/60 p-0.5 shadow-inner">
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-500 via-indigo-500 to-purple-500 transition-all duration-300 ease-out relative"
            style={{ width: `${clampedProgress}%` }}
          >
            {/* Shimmer light bar effect */}
            <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
          </div>
        </div>

        {/* Stats footer (if vertex/face count exists) */}
        {(vertCount !== undefined || faceCount !== undefined) && (
          <div className="mt-4 pt-3 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400">
            <div className="flex items-center gap-1.5">
              <Layers size={12} className="text-zinc-500" />
              <span>Geometría original:</span>
            </div>
            <div className="flex items-center gap-3 font-mono text-zinc-300">
              {vertCount !== undefined && <span>Vértices: <strong className="text-white">{vertCount}</strong></span>}
              {faceCount !== undefined && <span>Caras: <strong className="text-white">{faceCount}</strong></span>}
            </div>
          </div>
        )}

        {/* Info notice */}
        <div className="mt-3 text-[10px] text-zinc-500 text-center font-medium">
          Optimizando topología poligonal de forma segura...
        </div>
      </div>
    </div>
  );
};
