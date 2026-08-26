import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { CSGObject } from '../types';
import { WireframeModal } from './WireframeModal';
import { extractUniqueEdges } from '../utils/wireframeMesh';
import {
  Scissors,
  Layers,
  Layers3,
  Dot,
  Box,
  Trash2,
  Sparkles,
  RefreshCw,
  Maximize2,
  Split,
  PlusCircle,
  Link2,
  ArrowUpRight,
  ShieldAlert,
  Sliders,
  Compass,
  CheckCircle2,
  FlipHorizontal2,
  Repeat,
  Grid,
  CircleDot
} from 'lucide-react';

interface EditMeshPanelProps {
  object?: CSGObject | null;
}

export const EditMeshPanel: React.FC<EditMeshPanelProps> = ({ object: propObject }) => {
  const {
    project,
    selectedObjectId,
    editMode,
    setEditMode,
    selectedFaceIndices,
    selectedEdgeIndices,
    selectedVertexIndices,
    insertVertexMode,
    setInsertVertexMode,
    connectVertices,
    createFaceFromVertices,
    extrudeSelectedVertices,
    deleteSelectedVertices,
    symmetrizeVertices,
    weldSelectedVertices,
    subdivideShapeSegment,
    toggleShapeClosed,
    extrudeFaces,
    extrudeManifold,
    insetFaces,
    subdivideFaces,
    mergeFaces,
    flipSelectedFaceNormals,
    capSelectedFacesObject,
    deleteSelectedFaces,
    bevelSelectedEdges,
    applyLoopCut,
    loopCutMode,
    setLoopCutMode,
    loopCutCuts,
    setLoopCutCuts,
    loopCutSlide,
    setLoopCutSlide,
    subdivideSelectedEdges,
    bridgeSelectedEdges,
    dissolveSelectedEdges,
    deleteSelectedEdges,
    dissolveCoplanarObject,
    healObject,
    convertToWireframe,
    removeAllFaces,
  } = useStore();

  const obj = propObject || project.objects.find(o => o.id === selectedObjectId);

  const [showWireframeModal, setShowWireframeModal] = useState(false);
  const [extrudeAmount, setExtrudeAmount] = useState(0.3);
  const [insetAmount, setInsetAmount] = useState(0.2);
  const [bevelRadius, setBevelRadius] = useState(0.08);
  const [bevelSegs, setBevelSegs] = useState(3);
  const [weldTolerance, setWeldTolerance] = useState(0.02);
  const [symmetryAxis, setSymmetryAxis] = useState<'x' | 'y' | 'z'>('x');
  const [symmetryCenterSnap, setSymmetryCenterSnap] = useState(true);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const showFeedback = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 3500);
  };

  if (!obj) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-500 gap-3 select-none">
        <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 shadow-inner">
          <Scissors size={24} />
        </div>
        <div>
          <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Editar Malla</h3>
          <p className="text-[11px] text-zinc-500 mt-1 max-w-[200px]">
            Selecciona un objeto 3D o curva en la escena para modificar su topología, vértices y segmentos.
          </p>
        </div>
      </div>
    );
  }

  const vertCount = obj.vertices?.length ?? obj.stats?.vertices ?? 0;
  const faceCount = obj.faces?.length ?? obj.stats?.faces ?? 0;
  const aristasCount = extractUniqueEdges(obj).length;
  const numEdges = Math.floor(selectedEdgeIndices.length / 2);
  const isShape = obj.type === 'SHAPE';

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-zinc-950 text-zinc-200 divide-y divide-zinc-900 select-none pb-8 text-[11px]">
      
      {/* ── Header: Resumen del Objeto y Modo ── */}
      <div className="p-3 bg-zinc-900/40 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-bold text-zinc-100 truncate max-w-[140px] text-xs">{obj.name}</span>
          </div>
          <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
            {obj.type}
          </span>
        </div>

        {/* Estadísticas de Malla */}
        <div className="grid grid-cols-4 gap-1 py-1.5 px-2 bg-zinc-950/60 rounded-lg border border-white/5 text-[10px] text-zinc-400 text-center font-mono">
          <div>
            <span className="text-zinc-500 block text-[9px]">VÉRTICES</span>
            <span className="text-emerald-400 font-bold">{vertCount}</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[9px]">ARISTAS</span>
            <span className="text-cyan-400 font-bold">{aristasCount}</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[9px]">CARAS</span>
            <span className="text-amber-400 font-bold">{faceCount}</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[9px]">SELECCIÓN</span>
            <span className="text-indigo-400 font-bold">
              {editMode === 'VERTEX' ? `${selectedVertexIndices.length} vtx` :
               editMode === 'EDGE' ? `${numEdges} edge` :
               editMode === 'FACE' ? `${selectedFaceIndices.length} face` : 'Objeto'}
            </span>
          </div>
        </div>

        {/* Feedback Message */}
        {actionFeedback && (
          <div className="flex items-center gap-1.5 p-2 bg-emerald-950/80 border border-emerald-500/40 rounded-lg text-[10px] text-emerald-200">
            <CheckCircle2 size={13} className="text-emerald-400 flex-shrink-0" />
            <span>{actionFeedback}</span>
          </div>
        )}

        {/* Selector de Modo de Edición */}
        <div className="space-y-1 pt-1">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
            Modo de Trabajo
          </span>
          <div className="grid grid-cols-4 gap-1 p-1 bg-zinc-900 rounded-lg border border-white/5">
            <button
              type="button"
              onClick={() => setEditMode('OBJECT')}
              className={`flex flex-col items-center gap-1 py-1.5 rounded transition-all ${
                editMode === 'OBJECT'
                  ? 'bg-zinc-700 text-white font-bold shadow'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
              title="Modo Objeto (Atajo: 1 o Esc)"
            >
              <Box size={13} />
              <span className="text-[9px]">Objeto (1)</span>
            </button>
            <button
              type="button"
              onClick={() => setEditMode('VERTEX')}
              className={`flex flex-col items-center gap-1 py-1.5 rounded transition-all ${
                editMode === 'VERTEX'
                  ? 'bg-emerald-600 text-white font-bold shadow'
                  : 'text-zinc-400 hover:text-emerald-300 hover:bg-zinc-800'
              }`}
              title="Modo Vértices (Atajo: 4) - Ver y manipular todos los puntos"
            >
              <Dot size={13} />
              <span className="text-[9px]">Vértices (4)</span>
            </button>
            <button
              type="button"
              onClick={() => setEditMode('EDGE')}
              className={`flex flex-col items-center gap-1 py-1.5 rounded transition-all ${
                editMode === 'EDGE'
                  ? 'bg-indigo-600 text-white font-bold shadow'
                  : 'text-zinc-400 hover:text-indigo-300 hover:bg-zinc-800'
              }`}
              title="Modo Aristas / Bordes (Atajo: 3)"
            >
              <Layers3 size={13} />
              <span className="text-[9px]">Bordes (3)</span>
            </button>
            <button
              type="button"
              onClick={() => setEditMode('FACE')}
              className={`flex flex-col items-center gap-1 py-1.5 rounded transition-all ${
                editMode === 'FACE'
                  ? 'bg-amber-600 text-white font-bold shadow'
                  : 'text-zinc-400 hover:text-amber-300 hover:bg-zinc-800'
              }`}
              title="Modo Caras (Atajo: 2)"
            >
              <Layers size={13} />
              <span className="text-[9px]">Caras (2)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── SECCIÓN 1: AÑADIR LÍNEAS, SEGMENTOS Y VÉRTICES ── */}
      <div className="p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="font-bold text-zinc-200 flex items-center gap-1.5 text-xs">
            <Scissors size={14} className="text-emerald-400" />
            <span>Añadir Líneas y Vértices</span>
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 font-mono">
            Segmentos
          </span>
        </div>

        <p className="text-[10px] text-zinc-400 leading-relaxed">
          Conecta vértices para trazar nuevas aristas o divide líneas existentes para añadir puntos de control.
        </p>

        <div className="grid grid-cols-2 gap-1.5">
          {/* Conectar Vértices con Línea (J) */}
          <button
            type="button"
            onClick={() => {
              const res = connectVertices(obj.id, selectedVertexIndices);
              showFeedback(res.message);
            }}
            disabled={selectedVertexIndices.length < 2 && editMode === 'VERTEX'}
            className="py-2 px-2 bg-emerald-700/80 hover:bg-emerald-600 disabled:opacity-40 disabled:hover:bg-emerald-700/80 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 border border-emerald-500/40 transition-all shadow cursor-pointer col-span-2"
            title="Conecta 2 vértices seleccionados creando una línea/arista y dividiendo la cara (Tecla J)"
          >
            <Split size={13} />
            <span>Conectar Vértices con Línea (J)</span>
          </button>

          {/* Insertar Vértice / Dividir Segmento */}
          <button
            type="button"
            onClick={() => {
              if (isShape) {
                const res = subdivideShapeSegment(obj.id);
                showFeedback(res.message);
              } else {
                const res = subdivideSelectedEdges(obj.id, selectedEdgeIndices);
                showFeedback(res.message);
              }
            }}
            className="py-1.5 px-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 border border-zinc-700 transition-all cursor-pointer"
            title="Inserta un nuevo vértice en el centro de las aristas o segmentos seleccionados (Tecla D)"
          >
            <PlusCircle size={12} className="text-emerald-400" />
            <span>Dividir Arista / Vértice (D)</span>
          </button>

          {/* Extruir Vértice / Nuevo Segmento (E) */}
          <button
            type="button"
            onClick={() => {
              const res = extrudeSelectedVertices(obj.id, selectedVertexIndices);
              showFeedback(res.message);
            }}
            disabled={selectedVertexIndices.length === 0 && editMode === 'VERTEX'}
            className="py-1.5 px-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 border border-zinc-700 transition-all cursor-pointer"
            title="Extruye el vértice seleccionado creando un nuevo segmento (Tecla E)"
          >
            <ArrowUpRight size={12} className="text-amber-400" />
            <span>Extruir Vértice (E)</span>
          </button>

          {/* Crear Cara desde Vértices (F) */}
          <button
            type="button"
            onClick={() => {
              const res = createFaceFromVertices(obj.id, selectedVertexIndices);
              showFeedback(res.message);
            }}
            disabled={selectedVertexIndices.length < 2 && editMode === 'VERTEX'}
            className="py-1.5 px-2 bg-zinc-800 hover:bg-indigo-700 text-zinc-200 hover:text-white rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 border border-zinc-700 transition-all cursor-pointer"
            title="Genera un polígono o cara nueva a partir de los vértices seleccionados (Tecla F)"
          >
            <Layers size={12} className="text-indigo-400" />
            <span>Crear Cara / Polígono (F)</span>
          </button>

          {/* Modo Clic para Insertar Vértice */}
          {isShape && (
            <button
              type="button"
              onClick={() => setInsertVertexMode(!insertVertexMode)}
              className={`py-1.5 px-2 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer border ${
                insertVertexMode
                  ? 'bg-amber-600 text-white border-amber-400 shadow-sm'
                  : 'bg-zinc-800 text-zinc-200 border-zinc-700 hover:bg-zinc-700'
              }`}
              title="Haz clic sobre cualquier línea para insertar un vértice en ese punto exacto"
            >
              <PlusCircle size={12} />
              <span>{insertVertexMode ? 'Activo: Clic en línea' : 'Clic para Insertar (I)'}</span>
            </button>
          )}

          {/* Soldar Vértices */}
          <button
            type="button"
            onClick={async () => {
              const res = await weldSelectedVertices(obj.id, selectedVertexIndices, weldTolerance);
              showFeedback(res.message);
            }}
            className="py-1.5 px-2 bg-zinc-800 hover:bg-indigo-600 text-zinc-200 hover:text-white rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 border border-zinc-700 transition-all cursor-pointer"
            title="Fusiona vértices coincidentes o seleccionados (Tecla W)"
          >
            <Link2 size={12} className="text-violet-400" />
            <span>Soldar / Fusionar (W)</span>
          </button>
        </div>
      </div>

      {/* ── SECCIÓN 2: HERRAMIENTAS DE EDICIÓN SEGÚN MODO ACTIVO ── */}
      
      {/* MODO VÉRTICES */}
      {editMode === 'VERTEX' && (
        <div className="p-3 space-y-2.5 bg-emerald-950/10">
          <div className="flex items-center justify-between">
            <span className="font-bold text-emerald-300 flex items-center gap-1.5 text-xs">
              <Dot size={16} className="text-emerald-400" />
              <span>Operaciones de Vértices</span>
            </span>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-200 border border-emerald-600/30">
              {selectedVertexIndices.length} seleccionados
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => {
                const res = connectVertices(obj.id, selectedVertexIndices);
                showFeedback(res.message);
              }}
              disabled={selectedVertexIndices.length < 2}
              className="py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
            >
              ✂️ Conectar Línea (J)
            </button>

            <button
              type="button"
              onClick={() => {
                const res = createFaceFromVertices(obj.id, selectedVertexIndices);
                showFeedback(res.message);
              }}
              disabled={selectedVertexIndices.length < 3}
              className="py-1.5 px-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
            >
              🔲 Rellenar Cara (F)
            </button>

            <button
              type="button"
              onClick={async () => {
                const res = await weldSelectedVertices(obj.id, selectedVertexIndices, weldTolerance);
                showFeedback(res.message);
              }}
              className="py-1.5 px-2 bg-zinc-800 hover:bg-violet-700 text-zinc-200 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 border border-zinc-700 transition-all cursor-pointer"
            >
              🔗 Soldar (W)
            </button>

            <button
              type="button"
              onClick={() => {
                const res = deleteSelectedVertices(obj.id, selectedVertexIndices);
                showFeedback(res.message);
              }}
              disabled={selectedVertexIndices.length === 0}
              className="py-1.5 px-2 bg-rose-950/70 hover:bg-rose-600 disabled:opacity-40 text-rose-200 hover:text-white rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 border border-rose-800/50 transition-all cursor-pointer"
            >
              <Trash2 size={12} />
              <span>Eliminar (Supr)</span>
            </button>
          </div>

          {/* ── SIMETRÍA DE VÉRTICES / ESPEJO ── */}
          <div className="mt-2 pt-2 border-t border-emerald-900/40 space-y-2 bg-zinc-900/70 p-2.5 rounded-xl border border-emerald-500/20">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-300 flex items-center gap-1.5 text-[11px]">
                <FlipHorizontal2 size={13} className="text-emerald-400" />
                <span>Simetría de Vértices</span>
              </span>
              <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
                {(['x', 'y', 'z'] as const).map(ax => (
                  <button
                    key={ax}
                    type="button"
                    onClick={() => setSymmetryAxis(ax)}
                    className={`px-2 py-0.5 rounded text-[9.5px] font-mono font-bold uppercase transition-colors ${
                      symmetryAxis === ax
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {ax}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[9.5px] text-zinc-400 leading-tight">
              Selecciona los vértices de un lado. Al pulsar simetría, se proyectan al lado opuesto del eje <strong className="text-emerald-300 uppercase">{symmetryAxis}</strong> para dejar ambos lados idénticos.
            </p>

            <div className="flex items-center justify-between text-[10px] text-zinc-300 py-0.5">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={symmetryCenterSnap}
                  onChange={e => setSymmetryCenterSnap(e.target.checked)}
                  className="rounded border-zinc-700 text-emerald-500 focus:ring-0 bg-zinc-800"
                />
                <span>Ajustar centro ({symmetryAxis.toUpperCase()}=0)</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  const res = symmetrizeVertices(obj.id, selectedVertexIndices, {
                    axis: symmetryAxis,
                    direction: 'selected_to_opposite',
                    centerSnap: symmetryCenterSnap
                  });
                  showFeedback(res.message);
                }}
                disabled={selectedVertexIndices.length === 0}
                className="py-2 px-2 col-span-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white rounded-lg text-[10.5px] font-bold flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer"
                title="Aplica la simetría de los vértices seleccionados hacia el otro lado del eje"
              >
                <Repeat size={13} />
                <span>Aplicar Simetría ({selectedVertexIndices.length > 0 ? `${selectedVertexIndices.length} verts` : 'Selección'})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const res = symmetrizeVertices(obj.id, undefined, {
                    axis: symmetryAxis,
                    direction: '+to-',
                    centerSnap: symmetryCenterSnap
                  });
                  showFeedback(res.message);
                }}
                className="py-1.5 px-2 bg-zinc-800 hover:bg-emerald-800/80 text-zinc-200 hover:text-white rounded-lg text-[9.5px] font-semibold flex items-center justify-center gap-1 border border-zinc-700 transition-all cursor-pointer"
                title="Copiar lado positivo hacia el negativo"
              >
                <span>+{symmetryAxis.toUpperCase()} ➔ -{symmetryAxis.toUpperCase()}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const res = symmetrizeVertices(obj.id, undefined, {
                    axis: symmetryAxis,
                    direction: '-to+',
                    centerSnap: symmetryCenterSnap
                  });
                  showFeedback(res.message);
                }}
                className="py-1.5 px-2 bg-zinc-800 hover:bg-emerald-800/80 text-zinc-200 hover:text-white rounded-lg text-[9.5px] font-semibold flex items-center justify-center gap-1 border border-zinc-700 transition-all cursor-pointer"
                title="Copiar lado negativo hacia el positivo"
              >
                <span>-{symmetryAxis.toUpperCase()} ➔ +{symmetryAxis.toUpperCase()}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODO ARISTAS / BORDES */}
      {editMode === 'EDGE' && (
        <div className="p-3 space-y-2.5 bg-indigo-950/10">
          <div className="flex items-center justify-between">
            <span className="font-bold text-indigo-300 flex items-center gap-1.5 text-xs">
              <Layers3 size={14} className="text-indigo-400" />
              <span>Operaciones de Bordes</span>
            </span>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-indigo-900/40 text-indigo-200 border border-indigo-600/30">
              {numEdges} seleccionados
            </span>
          </div>

          {/* Biselado */}
          <div className="space-y-1.5 p-2 bg-zinc-900/60 rounded-lg border border-indigo-500/20">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-zinc-400">Radio de Bisel:</span>
              <span className="font-mono text-indigo-300">{bevelRadius.toFixed(2)}m</span>
            </div>
            <input
              type="range"
              min="0.01"
              max="1.5"
              step="0.01"
              value={bevelRadius}
              onChange={e => setBevelRadius(parseFloat(e.target.value))}
              className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer accent-indigo-500"
            />
            <button
              type="button"
              onClick={() => {
                const res = bevelSelectedEdges(obj.id, selectedEdgeIndices, bevelRadius, bevelSegs);
                showFeedback(res.message);
              }}
              disabled={selectedEdgeIndices.length < 2 && (!obj.edges || obj.edges.length === 0)}
              className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded text-[10px] font-bold flex items-center justify-center gap-1 transition-all shadow cursor-pointer"
            >
              <Sparkles size={12} />
              <span>Biselar / Redondear Bordes (B)</span>
            </button>
          </div>

          {/* Corte en Bucle y Deslizamiento (Loop Cut and Slide - Blender Ctrl+R) */}
          <div className="space-y-2 p-2 bg-zinc-900/80 rounded-lg border border-cyan-500/30">
            <div className="flex items-center justify-between">
              <span className="font-bold text-cyan-300 flex items-center gap-1 text-[11px]">
                <Repeat size={13} className="text-cyan-400" />
                <span>Corte en Bucle (Loop Cut)</span>
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 font-mono border border-cyan-800/40">
                Ctrl + R
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <div className="flex justify-between text-zinc-400 mb-0.5">
                  <span>Cortes:</span>
                  <span className="font-mono text-cyan-300">{loopCutCuts}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={loopCutCuts}
                  onChange={e => setLoopCutCuts(parseInt(e.target.value))}
                  className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer accent-cyan-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-zinc-400 mb-0.5">
                  <span>Deslizar:</span>
                  <span className="font-mono text-cyan-300">{loopCutSlide.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.95"
                  step="0.05"
                  value={loopCutSlide}
                  onChange={e => setLoopCutSlide(parseFloat(e.target.value))}
                  className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer accent-cyan-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setLoopCutMode(!loopCutMode)}
                className={`py-1.5 px-2 rounded-md text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  loopCutMode
                    ? 'bg-cyan-500 text-zinc-950 ring-2 ring-cyan-300 shadow-md animate-pulse'
                    : 'bg-zinc-800 hover:bg-cyan-900/70 text-cyan-200 border border-cyan-700/50'
                }`}
              >
                <Repeat size={12} />
                <span>{loopCutMode ? 'Activo (Pasa mouse)' : 'Modo Interactivo (Ctrl+R)'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const res = applyLoopCut(obj.id, undefined, loopCutCuts, loopCutSlide);
                  showFeedback(res.message);
                }}
                disabled={selectedEdgeIndices.length < 2}
                className="py-1.5 px-2 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white rounded-md text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
              >
                <span>Cortar Arista Sel.</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => {
                const res = subdivideSelectedEdges(obj.id, selectedEdgeIndices);
                showFeedback(res.message);
              }}
              disabled={selectedEdgeIndices.length < 2}
              className="py-1.5 px-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 border border-zinc-700 transition-all cursor-pointer"
            >
              ✂️ Dividir Arista (D)
            </button>

            <button
              type="button"
              onClick={() => {
                const res = bridgeSelectedEdges(obj.id, selectedEdgeIndices);
                showFeedback(res.message);
              }}
              disabled={numEdges < 2}
              className="py-1.5 px-2 bg-zinc-800 hover:bg-emerald-700 disabled:opacity-40 text-zinc-200 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 border border-zinc-700 transition-all cursor-pointer"
            >
              🌉 Puente / Cara (F)
            </button>

            <button
              type="button"
              onClick={() => {
                const res = dissolveSelectedEdges(obj.id, selectedEdgeIndices);
                showFeedback(res.message);
              }}
              disabled={selectedEdgeIndices.length < 2}
              className="py-1.5 px-2 bg-zinc-800 hover:bg-violet-700 disabled:opacity-40 text-zinc-200 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 border border-zinc-700 transition-all cursor-pointer"
            >
              ↩️ Disolver (X)
            </button>

            <button
              type="button"
              onClick={() => {
                const res = deleteSelectedEdges(obj.id, selectedEdgeIndices);
                showFeedback(res.message);
              }}
              disabled={selectedEdgeIndices.length < 2}
              className="py-1.5 px-2 bg-rose-950/70 hover:bg-rose-600 disabled:opacity-40 text-rose-200 hover:text-white rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 border border-rose-800/50 transition-all cursor-pointer"
            >
              <Trash2 size={12} />
              <span>Eliminar (Supr)</span>
            </button>
          </div>
        </div>
      )}

      {/* MODO CARAS */}
      {editMode === 'FACE' && (
        <div className="p-3 space-y-2.5 bg-amber-950/10">
          <div className="flex items-center justify-between">
            <span className="font-bold text-amber-300 flex items-center gap-1.5 text-xs">
              <Layers size={14} className="text-amber-400" />
              <span>Operaciones de Caras</span>
            </span>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-200 border border-amber-600/30">
              {selectedFaceIndices.length} seleccionadas
            </span>
          </div>

          {/* Extrusión */}
          <div className="space-y-1.5 p-2 bg-zinc-900/60 rounded-lg border border-amber-500/20">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-zinc-400">Distancia Extrusión:</span>
              <span className="font-mono text-amber-300">{extrudeAmount.toFixed(2)}m</span>
            </div>
            <input
              type="range"
              min="-2"
              max="5"
              step="0.05"
              value={extrudeAmount}
              onChange={e => setExtrudeAmount(parseFloat(e.target.value))}
              className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer accent-amber-500"
            />
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (selectedFaceIndices.length === 0) {
                    showFeedback('Selecciona una o más caras para extruir.');
                    return;
                  }
                  extrudeFaces(obj.id, selectedFaceIndices, extrudeAmount);
                  showFeedback('Extrusión estándar aplicada.');
                }}
                disabled={selectedFaceIndices.length === 0}
                className="w-full py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded text-[10px] font-bold flex items-center justify-center gap-1 transition-all shadow cursor-pointer"
                title="Extrusión estándar (E)"
              >
                <span>🚀 Extruir (E)</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (selectedFaceIndices.length === 0) {
                    showFeedback('Selecciona una o más caras para la Extrusión Manifold.');
                    return;
                  }
                  showFeedback('Calculando Extrusión Manifold...');
                  const res = await extrudeManifold(obj.id, selectedFaceIndices, extrudeAmount);
                  showFeedback(res.message);
                }}
                disabled={selectedFaceIndices.length === 0}
                className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded text-[10px] font-bold flex items-center justify-center gap-1 transition-all shadow cursor-pointer"
                title="Extrude Manifold (Blender Alt+E): Disuelve caras solapadas, perfora túneles/huecos limpios y mantiene el sólido cerrado y manifold"
              >
                <Sparkles size={11} />
                <span>Manifold (Alt+E)</span>
              </button>
            </div>
          </div>

          {/* Inset */}
          <div className="space-y-1.5 p-2 bg-zinc-900/60 rounded-lg border border-amber-500/20">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-zinc-400">Factor Inset:</span>
              <span className="font-mono text-amber-300">{insetAmount.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.01"
              max="0.8"
              step="0.02"
              value={insetAmount}
              onChange={e => setInsetAmount(parseFloat(e.target.value))}
              className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer accent-amber-500"
            />
            <button
              type="button"
              onClick={() => {
                const res = insetFaces(obj.id, selectedFaceIndices, insetAmount);
                showFeedback(res.message);
              }}
              disabled={selectedFaceIndices.length === 0}
              className="w-full py-1.5 bg-zinc-800 hover:bg-amber-700 disabled:opacity-40 text-zinc-200 hover:text-white rounded text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
            >
              <span>🔲 Inset Cara Interior (I)</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => {
                subdivideFaces(obj.id, selectedFaceIndices);
                showFeedback('Caras subdivididas.');
              }}
              disabled={selectedFaceIndices.length === 0}
              className="py-1.5 px-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 rounded text-[10px] font-semibold flex items-center justify-center gap-1 border border-zinc-700 transition-all cursor-pointer"
            >
              📐 Subdividir (D)
            </button>

            <button
              type="button"
              onClick={() => {
                mergeFaces(obj.id, selectedFaceIndices);
                showFeedback('Caras fusionadas.');
              }}
              disabled={selectedFaceIndices.length < 2}
              className="py-1.5 px-2 bg-zinc-800 hover:bg-amber-700 disabled:opacity-40 text-zinc-200 rounded text-[10px] font-semibold flex items-center justify-center gap-1 border border-zinc-700 transition-all cursor-pointer"
            >
              🔀 Fusionar (M)
            </button>

            <button
              type="button"
              onClick={async () => {
                await capSelectedFacesObject(obj.id);
                showFeedback('Hueco tapado con nueva cara.');
              }}
              className="py-1.5 px-2 bg-zinc-800 hover:bg-emerald-700 text-zinc-200 rounded text-[10px] font-semibold flex items-center justify-center gap-1 border border-zinc-700 transition-all cursor-pointer"
            >
              🕳️ Tapar Hueco (F)
            </button>

            <button
              type="button"
              onClick={() => {
                flipSelectedFaceNormals(obj.id, selectedFaceIndices);
                showFeedback('Normales de caras invertidas.');
              }}
              disabled={selectedFaceIndices.length === 0}
              className="py-1.5 px-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 rounded text-[10px] font-semibold flex items-center justify-center gap-1 border border-zinc-700 transition-all cursor-pointer"
            >
              🔄 Invertir Normales
            </button>

            <button
              type="button"
              onClick={() => {
                deleteSelectedFaces(obj.id, selectedFaceIndices);
                showFeedback('Caras eliminadas.');
              }}
              disabled={selectedFaceIndices.length === 0}
              className="py-1.5 px-2 bg-rose-950/70 hover:bg-rose-600 disabled:opacity-40 text-rose-200 hover:text-white rounded text-[10px] font-semibold flex items-center justify-center gap-1 border border-rose-800/50 transition-all cursor-pointer col-span-2"
            >
              <Trash2 size={12} />
              <span>Eliminar Caras Seleccionadas (Supr)</span>
            </button>
          </div>
        </div>
      )}

      {/* ── SECCIÓN 3: ESTRUCTURA ALÁMBRICA / WIREFRAME Y CARAS ── */}
      <div className="p-3 space-y-2 bg-zinc-900/40 border-t border-zinc-800">
        <div className="flex items-center justify-between">
          <span className="font-bold text-zinc-200 flex items-center gap-1.5 text-xs">
            <Grid size={14} className="text-emerald-400" />
            <span>Estructura Alámbrica / Wireframe</span>
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 font-mono border border-emerald-800/50">
            3D Exportable
          </span>
        </div>

        <p className="text-[10px] text-zinc-400 leading-tight">
          Elimina caras para dejar el objeto alámbrico o genera tubos 3D sólidos imprimibles.
        </p>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => {
              const res = removeAllFaces(obj.id);
              showFeedback(res.message);
            }}
            className="py-2 px-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/70 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer"
            title="Elimina todas las caras opacas, dejando únicamente la estructura de líneas visibles"
          >
            <Grid size={12} className="text-emerald-400" />
            <span>Eliminar Todas las Caras</span>
          </button>

          <button
            type="button"
            onClick={() => setShowWireframeModal(true)}
            className="py-2 px-2 bg-emerald-950/70 hover:bg-emerald-800 text-emerald-200 hover:text-white border border-emerald-700/60 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 shadow-sm transition-all cursor-pointer"
            title="Abre el asistente para convertir aristas en tubos 3D sólidos con grosor o exportar directamente"
          >
            <CircleDot size={12} className="text-emerald-400" />
            <span>Celosía 3D / Exportar...</span>
          </button>
        </div>
      </div>

      {/* ── SECCIÓN 4: LIMPIEZA TOPOLÓGICA Y CURADO ── */}
      <div className="p-3 space-y-2">
        <span className="font-bold text-zinc-200 flex items-center gap-1.5 text-xs">
          <ShieldAlert size={14} className="text-cyan-400" />
          <span>Limpieza y Optimización</span>
        </span>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={async () => {
              await dissolveCoplanarObject(obj.id);
              showFeedback('Disolución coplanar completada.');
            }}
            className="py-2 px-2 bg-zinc-900 hover:bg-cyan-900/60 text-cyan-200 hover:text-white border border-cyan-800/40 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer"
            title="Disuelve aristas y diagonales intermedias en caras planas para dejar superficies poligonales limpias"
          >
            🧹 Disolver Coplanares
          </button>

          <button
            type="button"
            onClick={async () => {
              await healObject(obj.id);
              showFeedback('Curado topológico aplicado.');
            }}
            className="py-2 px-2 bg-zinc-900 hover:bg-indigo-900/60 text-indigo-200 hover:text-white border border-indigo-800/40 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer"
            title="Cierra vacíos, fusiona duplicados y consolida sólido manifold"
          >
            🩹 Curar Malla Manifold
          </button>
        </div>
      </div>

      {/* ── SECCIÓN 5: GUÍA DE ATAJOS ── */}
      <div className="p-3 space-y-2 bg-zinc-900/30">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
          Atajos Rápidos de Modelado
        </span>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9.5px] text-zinc-400">
          <div><kbd className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-200 font-mono">1</kbd> Modo Objeto</div>
          <div><kbd className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-200 font-mono">4</kbd> Modo Vértices</div>
          <div><kbd className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-200 font-mono">2</kbd> Modo Caras</div>
          <div><kbd className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-200 font-mono">3</kbd> Modo Bordes</div>
          <div><kbd className="px-1 py-0.5 bg-zinc-800 rounded text-emerald-300 font-mono">J</kbd> Conectar Línea</div>
          <div><kbd className="px-1 py-0.5 bg-zinc-800 rounded text-amber-300 font-mono">E</kbd> Extruir</div>
          <div><kbd className="px-1 py-0.5 bg-zinc-800 rounded text-indigo-300 font-mono">F</kbd> Crear Cara</div>
          <div><kbd className="px-1 py-0.5 bg-zinc-800 rounded text-violet-300 font-mono">W</kbd> Soldar</div>
        </div>
      </div>

      {/* Wireframe Modal */}
      {showWireframeModal && (
        <WireframeModal
          isOpen={showWireframeModal}
          onClose={() => setShowWireframeModal(false)}
          targetObject={obj}
        />
      )}

    </div>
  );
};
