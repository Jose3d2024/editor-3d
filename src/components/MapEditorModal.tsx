import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Upload, Maximize2 } from 'lucide-react';

interface MapEditorModalProps {
  title: string;
  url: string | null;
  intensity?: number;
  onIntensityChange?: (value: number) => void;
  repeat?: [number, number];
  onRepeatChange?: (v: [number, number]) => void;
  offset?: [number, number];
  onOffsetChange?: (v: [number, number]) => void;
  rotation?: number;
  onRotationChange?: (v: number) => void;
  onApplyToAllMaps?: (repeat: [number, number], offset: [number, number], rotation: number) => void;
  onClose: () => void;
  onUpdate: (url: string | null) => void;
}

export const MapEditorModal: React.FC<MapEditorModalProps> = ({ 
  title, url, intensity, onIntensityChange, 
  repeat = [1, 1], onRepeatChange,
  offset = [0, 0], onOffsetChange,
  rotation = 0, onRotationChange,
  onApplyToAllMaps,
  onClose, onUpdate 
}) => {
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        onUpdate(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className="bg-[#0a0a0a]/95 border border-zinc-800/50 rounded-2xl shadow-2xl w-[95vw] max-w-5xl h-[90vh] max-h-[900px] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800/50 bg-zinc-900/30 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.6)]" />
            <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-[0.2em]">Editor de Mapa: {title}</h3>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800/50 rounded-full transition-all">
            <X size={18} />
          </button>
        </div>
        
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          {/* Large Preview - Prioritized */}
          <div className="flex-1 p-4 md:p-8 flex items-center justify-center bg-zinc-950/50 min-h-0">
            <div className="relative w-full h-full flex items-center justify-center">
              <div className="relative aspect-square max-w-full max-h-full bg-zinc-950 rounded-xl border border-zinc-800/50 overflow-hidden shadow-2xl flex items-center justify-center">
                {url ? (
                  <img 
                    src={url} 
                    alt="Map Preview" 
                    className="w-full h-full object-contain transition-all duration-300" 
                    referrerPolicy="no-referrer" 
                    style={{ 
                      filter: `brightness(${brightness}%) contrast(${contrast}%)`,
                      transform: `scale(${repeat[0]}, ${repeat[1]}) translate(${offset[0]}%, ${offset[1]}%) rotate(${rotation}deg)`
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-zinc-700 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-900 to-zinc-950">
                    <Maximize2 size={64} className="mb-6 opacity-10" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-40">Sin Mapa Asignado</span>
                  </div>
                )}
                
                {/* Overlay Info */}
                <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end pointer-events-none">
                  <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5">
                    <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Vista Previa</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Controls - Smaller and Sidebar-like */}
          <div className="w-full lg:w-80 p-4 md:p-8 lg:border-l border-zinc-800/50 flex flex-col gap-6 overflow-y-auto bg-zinc-900/20 flex-shrink-0 lg:flex-shrink">
            <div className="space-y-6">
              <div className="space-y-4">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Configuración Principal</label>
                
                {onIntensityChange !== undefined && (
                  <div className="p-4 bg-zinc-900/40 rounded-xl border border-zinc-800/50 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-zinc-400 font-bold uppercase">Intensidad</span>
                      <span className="text-[10px] font-mono text-indigo-400">{(intensity || 0).toFixed(2)}</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="2" 
                      step="0.01" 
                      value={intensity || 0} 
                      onChange={(e) => onIntensityChange(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>
                )}

                {/* Transform Controls */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Transformación (Escala/Tiling)</label>
                    <button 
                      onClick={() => {
                        onRepeatChange?.([1, 1]);
                        onOffsetChange?.([0, 0]);
                        onRotationChange?.(0);
                      }}
                      className="text-[9px] font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-widest transition-colors"
                    >
                      Resetear
                    </button>
                  </div>
                  
                  <div className="p-4 bg-zinc-900/40 rounded-xl border border-zinc-800/50 space-y-4">
                    {/* Scale (Repeat) X */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase">Repetir X</span>
                        <span className="text-[9px] font-mono text-indigo-400">{repeat[0].toFixed(1)}x</span>
                      </div>
                      <input 
                        type="range" min="0.1" max="10" step="0.1" 
                        value={repeat[0]} 
                        onChange={(e) => onRepeatChange?.([parseFloat(e.target.value), repeat[1]])}
                        className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>

                    {/* Scale (Repeat) Y */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase">Repetir Y</span>
                        <span className="text-[9px] font-mono text-indigo-400">{repeat[1].toFixed(1)}x</span>
                      </div>
                      <input 
                        type="range" min="0.1" max="10" step="0.1" 
                        value={repeat[1]} 
                        onChange={(e) => onRepeatChange?.([repeat[0], parseFloat(e.target.value)])}
                        className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>

                    {/* Offset X */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase">Desplazamiento X</span>
                        <span className="text-[9px] font-mono text-indigo-400">{offset[0].toFixed(2)}</span>
                      </div>
                      <input 
                        type="range" min="-1" max="1" step="0.01" 
                        value={offset[0]} 
                        onChange={(e) => onOffsetChange?.([parseFloat(e.target.value), offset[1]])}
                        className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>

                    {/* Offset Y */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase">Desplazamiento Y</span>
                        <span className="text-[9px] font-mono text-indigo-400">{offset[1].toFixed(2)}</span>
                      </div>
                      <input 
                        type="range" min="-1" max="1" step="0.01" 
                        value={offset[1]} 
                        onChange={(e) => onOffsetChange?.([offset[0], parseFloat(e.target.value)])}
                        className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>

                    {/* Rotation */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase">Rotación</span>
                        <span className="text-[9px] font-mono text-indigo-400">{rotation}°</span>
                      </div>
                      <input 
                        type="range" min="0" max="360" step="1" 
                        value={rotation} 
                        onChange={(e) => onRotationChange?.(parseFloat(e.target.value))}
                        className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Visual Adjustments (Preview Only) */}
                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Ajustes de Visualización</label>
                  <div className="p-4 bg-zinc-900/40 rounded-xl border border-zinc-800/50 space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase">Brillo</span>
                        <span className="text-[9px] font-mono text-indigo-400">{brightness}%</span>
                      </div>
                      <input 
                        type="range" min="0" max="200" step="1" 
                        value={brightness} 
                        onChange={(e) => setBrightness(parseInt(e.target.value))}
                        className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase">Contraste</span>
                        <span className="text-[9px] font-mono text-indigo-400">{contrast}%</span>
                      </div>
                      <input 
                        type="range" min="0" max="200" step="1" 
                        value={contrast} 
                        onChange={(e) => setContrast(parseInt(e.target.value))}
                        className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col items-center justify-center gap-2 p-3 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-600/20 rounded-xl cursor-pointer transition-all group">
                    <Upload size={14} className="group-hover:-translate-y-0.5 transition-transform" />
                    <span className="text-[9px] font-bold uppercase">Subir</span>
                    <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                  </label>
                  
                  {url && (
                    <button 
                      onClick={() => onUpdate(null)}
                      className="flex flex-col items-center justify-center gap-2 p-3 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-600/20 rounded-xl transition-all group"
                    >
                      <Trash2 size={14} className="group-hover:scale-110 transition-transform" />
                      <span className="text-[9px] font-bold uppercase">Borrar</span>
                    </button>
                  )}
                </div>

                {onApplyToAllMaps && (
                  <button
                    onClick={() => onApplyToAllMaps(repeat, offset, rotation)}
                    className="w-full py-2.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-600/20 rounded-xl transition-all text-[10px] font-bold uppercase tracking-widest"
                  >
                    Aplicar a todos los mapas
                  </button>
                )}
              </div>
            </div>

            <div className="p-4 bg-zinc-900/30 rounded-xl border border-zinc-800/50">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-3 bg-indigo-500 rounded-full" />
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Información</span>
              </div>
              <p className="text-[10px] text-zinc-500 leading-relaxed italic">
                {title.includes('Normal') && 'Los mapas de normales añaden detalle de relieve sin aumentar la geometría.'}
                {title.includes('Roughness') && 'Controla la rugosidad de la superficie. Valores altos son mate, bajos son brillantes.'}
                {title.includes('Metalness') && 'Define si la superficie es metálica o dieléctrica.'}
                {title.includes('Displacement') && 'Desplaza físicamente los vértices para crear relieve real.'}
                {title.includes('Albedo') && 'El color base o textura principal del material.'}
              </p>
            </div>

            <button 
              onClick={onClose} 
              className="mt-auto w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-bold uppercase tracking-[0.2em] rounded-xl transition-all border border-zinc-700/50 shadow-lg"
            >
              Finalizar Edición
            </button>
          </div>
        </div>
      </div>
    </div>,
    modalRoot
  );
};
