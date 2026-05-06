/**
 * SiluetaTab.tsx — "Del Plano a la Realidad"
 *
 * Herramienta completa con:
 *  - Subida de imagen por plano (Alzado, Perfil, Planta)
 *  - Extracción automática de silueta por umbral de luminancia
 *  - Editor 2D interactivo por plano (arrastrar puntos, añadir, borrar)
 *  - Generación de malla 3D por intersección de tres prismas (CSG)
 */

import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import {
  extractSilhouetteFromImage,
  silhouettesToMesh,
  fileToDataURL,
  ensureCCW,
} from '../utils/silhouettes';
import type { V3, MeshFace } from '../types';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type PlaneKey = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

interface SiluetaTabProps {
  onGenerate: (vertices: V3[], faces: MeshFace[], name: string) => void;
}

// ─── Constantes de estilo por plano ──────────────────────────────────────────

const PLANE_CONFIG: Record<PlaneKey, { label: string; desc: string; color: string; border: string; bg: string; icon: string }> = {
  front:  { label: 'Frontal',  desc: 'Vista frontal (XY)',   color: '#f87171', border: 'border-red-600/70',   bg: 'bg-red-900/20',   icon: 'Front' },
  back:   { label: 'Trasera',  desc: 'Vista trasera (XY)',   color: '#ef4444', border: 'border-red-700/70',   bg: 'bg-red-950/20',   icon: 'Back' },
  left:   { label: 'Izquierda',desc: 'Vista izquierda (ZY)', color: '#60a5fa', border: 'border-blue-600/70',  bg: 'bg-blue-900/20',  icon: 'Left' },
  right:  { label: 'Derecha',  desc: 'Vista derecha (ZY)',   color: '#3b82f6', border: 'border-blue-700/70',  bg: 'bg-blue-950/20',  icon: 'Right' },
  top:    { label: 'Superior', desc: 'Vista superior (XZ)',  color: '#4ade80', border: 'border-green-600/70', bg: 'bg-green-900/20', icon: 'Top' },
  bottom: { label: 'Inferior', desc: 'Vista inferior (XZ)',  color: '#22c55e', border: 'border-green-700/70', bg: 'bg-green-950/20', icon: 'Bottom' },
};

const PLANE_ORDER: PlaneKey[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];

// ─── SiluetaTab principal ─────────────────────────────────────────────────────

export const SiluetaTab: React.FC<SiluetaTabProps> = ({ onGenerate }) => {
  const { project, setSilueta } = useStore();
  const { silueta } = project;
  const [threshold,   setThreshold]   = useState(128);
  const [numPoints,   setNumPoints]   = useState(48);
  const [boxSize,     setBoxSize]     = useState(2);
  const [processing,  setProcessing]  = useState(false);

  // ── Subir imagen y extraer contorno ──────────────────────────────────────
  const handleUpload = async (key: PlaneKey, file: File) => {
    const url     = await fileToDataURL(file);
    const contour = await extractSilhouetteFromImage(url, { numPoints, threshold });
    setSilueta({ 
      [key]: contour ?? [],
      [`${key}Image` as any]: url 
    });
  };

  // ── Generar malla 3D ──────────────────────────────────────────────────────
  const allReady = PLANE_ORDER.some(k => silueta[k] && silueta[k]!.length >= 3);

  const handleGenerate = async () => {
    if (!allReady) return;
    setProcessing(true);
    try {
      const result = silhouettesToMesh(
        {
          front: silueta.front,
          back:  silueta.back,
          left:  silueta.left,
          right: silueta.right,
          top:   silueta.top,
          bottom:silueta.bottom,
        },
        boxSize,
      );
      if (!result || result.vertices.length === 0) {
        alert('No se pudo generar la malla. Comprueba que los contornos se superponen en el espacio 3D.');
        return;
      }
      onGenerate(result.vertices, result.faces, 'Plano a la Realidad');
      // Reset tool
      setSilueta({ 
        activePlane: null,
        front: null,
        back: null,
        left: null,
        right: null,
        top: null,
        bottom: null,
        frontImage: null,
        backImage: null,
        leftImage: null,
        rightImage: null,
        topImage: null,
        bottomImage: null
      });
    } finally {
      setProcessing(false);
    }
  };

  const activePlane = silueta.activePlane || 'front';
  const cfg = PLANE_CONFIG[activePlane];

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <p className="text-[12px] font-bold text-zinc-100">✏️ Del Plano a la Realidad</p>
        <p className="text-[9px] text-zinc-500 leading-tight mt-0.5">
          Dibuja en los visores Frontal, Lateral y Superior. Los bordes de los visores se iluminarán cuando la herramienta esté activa.
        </p>
      </div>

      {/* ── Selector de plano activo ────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-1">
        {PLANE_ORDER.map(key => {
          const c  = PLANE_CONFIG[key];
          const contour = silueta[key];
          const ok = contour && contour.length >= 3;
          const isActive = silueta.activePlane === key;
          return (
            <button key={key} onClick={() => setSilueta({ activePlane: isActive ? null : key })}
              className={`flex flex-col items-center py-2 rounded-lg border text-[9px] font-bold transition-all ${
                isActive ? `${c.bg} ${c.border} text-white` : `border-zinc-800 text-zinc-500 hover:border-zinc-700`
              }`}>
              <span style={{ color: c.color }} className="text-[10px] mb-0.5">
                {c.icon}
              </span>
              {c.label}
              <span className={`text-[7px] mt-0.5 ${ok ? 'text-emerald-400' : 'text-zinc-600'}`}>
                {ok ? `✓ ${contour!.length}pts` : 'sin contorno'}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Panel del plano activo ──────────────────────────────────────────── */}
      {silueta.activePlane && (
        <div className={`rounded-lg border p-3 space-y-3 ${cfg.border} ${cfg.bg}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold" style={{ color: cfg.color }}>{cfg.label} Activo</p>
              <p className="text-[8px] text-zinc-400">
                • Clic para añadir/insertar puntos.<br/>
                • Arrastra para mover.<br/>
                • Alt + Clic para borrar.
              </p>
            </div>
            <button
              onClick={() => {
                const inp = document.createElement('input');
                inp.type = 'file'; inp.accept = 'image/*';
                inp.onchange = (e: any) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(silueta.activePlane!, f);
                };
                inp.click();
              }}
              className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-[9px] font-semibold transition-colors"
            >
              ↑ Subir imagen
            </button>
          </div>

          <div className="flex justify-between items-center">
            <button 
              onClick={() => setSilueta({ [silueta.activePlane!]: [] })}
              className="px-2 py-1 bg-zinc-800 hover:bg-red-900/50 rounded text-[8px] text-zinc-500 hover:text-red-300 transition-colors"
            >
              ↺ Limpiar Contorno
            </button>
            <span className="text-[8px] text-zinc-500">
              {silueta[silueta.activePlane!]?.length || 0} puntos
            </span>
          </div>
        </div>
      )}

      {/* ── Controles de extracción ────────────────────────────────────────── */}
      <div className="bg-zinc-800/50 rounded-lg p-2 space-y-1.5 border border-white/5">
        <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Ajustes de extracción</p>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-zinc-500 w-16 flex-shrink-0">Umbral</span>
          <input type="range" min={30} max={225} value={threshold}
            onChange={e => setThreshold(+e.target.value)}
            className="flex-1 h-1 accent-violet-500"/>
          <span className="text-[9px] text-zinc-300 font-mono w-8 text-right">{threshold}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-zinc-500 w-16 flex-shrink-0">Precisión</span>
          <input type="range" min={12} max={96} step={4} value={numPoints}
            onChange={e => setNumPoints(+e.target.value)}
            className="flex-1 h-1 accent-violet-500"/>
          <span className="text-[9px] text-zinc-300 font-mono w-8 text-right">{numPoints}pt</span>
        </div>
      </div>

      {/* ── Tamaño final ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-[9px] text-zinc-500 w-16 flex-shrink-0">Tamaño 3D</span>
        <input type="range" min={0.5} max={5} step={0.1} value={boxSize}
          onChange={e => setBoxSize(+e.target.value)} className="flex-1 h-1 accent-violet-500"/>
        <span className="text-[9px] text-zinc-300 font-mono w-8 text-right">{boxSize.toFixed(1)}</span>
      </div>

      {!allReady && (
        <p className="text-[9px] text-amber-400 text-center bg-amber-900/20 rounded px-2 py-1 border border-amber-900/50">
          ⚠ Define el contorno de los 3 planos para generar la malla
        </p>
      )}

      {/* Botón generar */}
      <button
        disabled={!allReady || processing}
        onClick={handleGenerate}
        className={`w-full py-3 rounded-lg text-[11px] font-bold transition-all ${
          allReady && !processing
            ? 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/20'
            : 'bg-zinc-800 text-zinc-600 cursor-not-allowed border border-white/5'
        }`}
      >
        {processing ? '⏳ Generando malla 3D…' : allReady ? '✨ Crear Malla' : 'Faltan contornos'}
      </button>

      {/* Ayuda */}
      <div className="bg-zinc-900/50 rounded p-2 text-[8px] text-zinc-500 border border-white/5">
        <p className="font-bold text-zinc-400 mb-1 uppercase tracking-widest">Instrucciones</p>
        <p>1. Selecciona un plano (Frontal, Trasero, etc.).</p>
        <p>2. Dibuja en el visor: Clic (añadir), Arrastrar (mover), Alt+Clic (borrar).</p>
        <p>3. O sube una imagen para extraer la silueta automáticamente.</p>
        <p>4. Pulsa "Crear Malla" cuando tengas al menos un contorno listo.</p>
      </div>
    </div>
  );
};
