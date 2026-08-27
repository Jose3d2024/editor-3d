import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { CSGObject } from '../types';
import { Exporter } from '../utils/exporters';
import { extractUniqueEdges, type WireframeOptions } from '../utils/wireframeMesh';
import { safeFixed } from '../utils/numberUtils';
import {
  Grid,
  Boxes,
  Download,
  X,
  Sparkles,
  Layers,
  CircleDot,
  Sliders,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface WireframeModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetObject?: CSGObject | null;
}

export const WireframeModal: React.FC<WireframeModalProps> = ({
  isOpen,
  onClose,
  targetObject,
}) => {
  const { project, selectedObjectId, convertToWireframe, removeAllFaces } = useStore();

  const obj = targetObject || project.objects.find(o => o.id === selectedObjectId) || project.objects[0];

  const [mode, setMode] = useState<'TUBES' | 'REMOVE_FACES'>('TUBES');
  const [radius, setRadius] = useState<number>(0.035);
  const [radialSegments, setRadialSegments] = useState<number>(6);
  const [addJointSpheres, setAddJointSpheres] = useState<boolean>(true);
  const [dissolveCoplanars, setDissolveCoplanars] = useState<boolean>(true);
  const [asNewObject, setAsNewObject] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const edgesCount = obj ? extractUniqueEdges({
    vertices: obj.vertices,
    faces: obj.faces,
    wireframeEdges: obj.wireframeEdges,
    parameters: obj.parameters,
  }, { dissolveCoplanars }).length : 0;

  const handleApply = () => {
    if (!obj) return;
    if (mode === 'REMOVE_FACES') {
      const res = removeAllFaces(obj.id);
      showStatus(res.message);
      if (res.success) {
        setTimeout(onClose, 1200);
      }
    } else {
      const options: WireframeOptions = {
        mode: 'TUBES',
        radius,
        radialSegments,
        addJointSpheres,
        dissolveCoplanars,
        asNewObject,
      };
      const res = convertToWireframe(obj.id, options);
      showStatus(res.message);
      if (res.success) {
        setTimeout(onClose, 1200);
      }
    }
  };

  const handleExport = async (format: 'STL' | 'OBJ' | 'GLB') => {
    if (!obj) return;
    setIsExporting(format);
    try {
      const options: WireframeOptions = {
        mode: 'TUBES',
        radius,
        radialSegments,
        addJointSpheres,
        dissolveCoplanars,
      };
      await Exporter.exportWireframe([obj], project.materials, format, options);
      showStatus(`¡Exportado como archivo ${format} alámbrico exitosamente!`);
    } catch (err: any) {
      console.error(err);
      showStatus(`Error al exportar: ${err.message || 'Error desconocido'}`);
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-950/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-950/80 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
              <Grid size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Estructura Alámbrica / Jaula 3D</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 font-normal border border-emerald-700/50">
                  Wireframe
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Elimina las caras y convierte las aristas en alambre puro o tubos 3D exportables.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-zinc-200">
          {/* Objeto Info */}
          {obj ? (
            <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <Boxes size={16} className="text-emerald-400" />
                <div>
                  <div className="font-semibold text-white">{obj.name || 'Objeto Seleccionado'}</div>
                  <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                    {obj.vertices?.length || 0} vértices • {obj.faces?.length || 0} caras originales
                  </div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-mono font-bold px-2 py-1 bg-zinc-800 text-emerald-400 rounded-md border border-zinc-700">
                  {edgesCount} aristas
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-amber-950/40 rounded-xl border border-amber-800/50 text-amber-300 text-xs flex items-center gap-2">
              <AlertCircle size={16} />
              <span>No hay ningún objeto seleccionado. Selecciona uno en la escena.</span>
            </div>
          )}

          {/* Selector de Modo */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider block">
              Tipo de Conversión
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('TUBES')}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                  mode === 'TUBES'
                    ? 'bg-emerald-950/60 border-emerald-500/80 text-white shadow-md shadow-emerald-950/50'
                    : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <CircleDot size={14} /> Tubos 3D Sólidos
                  </span>
                  {mode === 'TUBES' && <span className="text-[10px] text-emerald-400 font-bold">✓</span>}
                </div>
                <span className="text-[10px] text-zinc-400 leading-tight">
                  Genera celosía física 3D con grosor. 100% imprimible y exportable en STL, OBJ y GLTF.
                </span>
              </button>

              <button
                type="button"
                onClick={() => setMode('REMOVE_FACES')}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                  mode === 'REMOVE_FACES'
                    ? 'bg-emerald-950/60 border-emerald-500/80 text-white shadow-md shadow-emerald-950/50'
                    : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <Grid size={14} /> Solo Líneas (Sin Caras)
                  </span>
                  {mode === 'REMOVE_FACES' && <span className="text-[10px] text-emerald-400 font-bold">✓</span>}
                </div>
                <span className="text-[10px] text-zinc-400 leading-tight">
                  Elimina todas las caras dejando solo la jaula alámbrica visible en el visor.
                </span>
              </button>
            </div>
          </div>

          {/* Opciones de Tubos 3D (Solo visible en modo TUBES) */}
          {mode === 'TUBES' && (
            <div className="p-3.5 bg-zinc-950/60 rounded-xl border border-zinc-800 space-y-3.5">
              {/* Radio / Grosor del Alambre */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300 font-medium flex items-center gap-1.5">
                    <Sliders size={13} className="text-emerald-400" />
                    Grosor / Radio del Alambre:
                  </span>
                  <span className="font-mono text-emerald-400 font-bold bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                    {safeFixed(radius, 3)} m
                  </span>
                </div>
                <input
                  type="range"
                  min="0.005"
                  max="0.25"
                  step="0.005"
                  value={radius}
                  onChange={e => setRadius(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
                  <span>Fino (0.005)</span>
                  <span>Medio (0.040)</span>
                  <span>Grueso (0.250)</span>
                </div>
              </div>

              {/* Perfil del Tubo */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300 font-medium">Lados del Perfil (Forma del Tubo):</span>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    {radialSegments === 3 ? 'Triangular (Low-poly)' : radialSegments === 4 ? 'Cuadrado' : radialSegments === 6 ? 'Hexagonal' : 'Cilíndrico'}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { seg: 3, label: '3 Lados' },
                    { seg: 4, label: '4 Lados' },
                    { seg: 6, label: '6 Lados' },
                    { seg: 8, label: '8 Lados' },
                  ].map(item => (
                    <button
                      key={item.seg}
                      type="button"
                      onClick={() => setRadialSegments(item.seg)}
                      className={`py-1.5 text-[10px] font-semibold rounded-lg border transition-all ${
                        radialSegments === item.seg
                          ? 'bg-emerald-600 border-emerald-400 text-white shadow'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Esferas en Vértices */}
              <div className="flex items-center justify-between pt-1 border-t border-zinc-800/80">
                <div>
                  <div className="text-xs font-semibold text-zinc-200">Uniones Esféricas en Nodos</div>
                  <div className="text-[10px] text-zinc-500">Crea esferas en las esquinas para uniones suaves</div>
                </div>
                <button
                  type="button"
                  onClick={() => setAddJointSpheres(!addJointSpheres)}
                  className={`w-10 h-5 rounded-full transition-colors relative p-0.5 ${
                    addJointSpheres ? 'bg-emerald-600' : 'bg-zinc-800'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      addJointSpheres ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Optimizar y Disolver Aristas Coplanares */}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
                <div>
                  <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                    <span>Limpieza Coplanar Automática</span>
                    <span className="text-[9px] px-1.5 py-0.2 bg-emerald-950 text-emerald-400 border border-emerald-800/60 rounded">Óptimo</span>
                  </div>
                  <div className="text-[10px] text-zinc-500">Elimina diagonales y aristas internas en caras planas</div>
                </div>
                <button
                  type="button"
                  onClick={() => setDissolveCoplanars(!dissolveCoplanars)}
                  className={`w-10 h-5 rounded-full transition-colors relative p-0.5 ${
                    dissolveCoplanars ? 'bg-emerald-600' : 'bg-zinc-800'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      dissolveCoplanars ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Crear como Nuevo Objeto */}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
                <div>
                  <div className="text-xs font-semibold text-zinc-200">Crear como Copia / Duplicado</div>
                  <div className="text-[10px] text-zinc-500">Conserva el objeto original intacto</div>
                </div>
                <button
                  type="button"
                  onClick={() => setAsNewObject(!asNewObject)}
                  className={`w-10 h-5 rounded-full transition-colors relative p-0.5 ${
                    asNewObject ? 'bg-emerald-600' : 'bg-zinc-800'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      asNewObject ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* Feedback message */}
          {statusMessage && (
            <div className="p-3 bg-emerald-950/70 border border-emerald-500/50 rounded-xl text-emerald-200 text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950/90 flex flex-col gap-2.5">
          {/* Botón Aplicar a la escena */}
          <button
            type="button"
            onClick={handleApply}
            disabled={!obj}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950 transition-all cursor-pointer"
          >
            <Sparkles size={15} />
            <span>Aplicar Estructura Alámbrica a la Escena</span>
          </button>

          {/* Botones de Exportación Directa */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleExport('STL')}
              disabled={!obj || isExporting !== null}
              className="py-2 px-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 border border-zinc-700 transition-all cursor-pointer"
              title="Exporta como STL Manifold para impresión 3D"
            >
              <Download size={13} className="text-emerald-400" />
              <span>{isExporting === 'STL' ? 'Exportando...' : 'Exportar STL'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleExport('OBJ')}
              disabled={!obj || isExporting !== null}
              className="py-2 px-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 border border-zinc-700 transition-all cursor-pointer"
              title="Exporta como archivo Wavefront OBJ"
            >
              <Download size={13} className="text-emerald-400" />
              <span>{isExporting === 'OBJ' ? 'Exportando...' : 'Exportar OBJ'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleExport('GLB')}
              disabled={!obj || isExporting !== null}
              className="py-2 px-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 border border-zinc-700 transition-all cursor-pointer"
              title="Exporta como GLB binario para web y motores 3D"
            >
              <Download size={13} className="text-emerald-400" />
              <span>{isExporting === 'GLB' ? 'Exportando...' : 'Exportar GLB'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
