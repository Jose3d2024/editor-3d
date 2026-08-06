/**
 * PropertiesPanel.tsx
 *
 * Panel lateral de propiedades del objeto seleccionado.
 * Permite editar TODOS los parámetros en tiempo real con regeneración automática.
 */

import { MaterialPanel } from './MaterialPanel';
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import {
  generatePolygon, generateArc,
  latheMesh, LATHE_PRESETS,
  sweepMesh, SWEEP_PROFILES, makeStraightPath, makeArcPath, makeHelixPath,
  loftMesh, circleSection, squareSection, starSection,
} from '../utils/modifiers';
import type { V3, MeshFace, MaterialData, CameraObject, Transform, BackgroundMode } from '../types';
import { PRESET_HDRIS } from '../utils/environmentHelper';
import { useStore } from '../store/useStore';
import type { CSGObject } from '../types';
import { MapEditorModal } from './MapEditorModal';
import { ProceduralMapModal, ProceduralConfig } from './ProceduralMapModal';
import { createCameraPathObject } from '../utils/cameraPathHelper';
import {
  ChevronDown, ChevronUp, ChevronRight, RotateCw, Maximize, Maximize2,
  Move, Eye, EyeOff, Trash2, Copy, Save, Book,
  Box, Layers, Wand2, CheckCircle, Square,
  AlignCenterHorizontal, AlignCenterVertical, AlignStartHorizontal,
  AlignEndHorizontal, AlignStartVertical, AlignEndVertical,
  Image as ImageIcon, Upload, Download, FileDown,
  Palette, Settings, Plus, X, MousePointer2, Info, Globe, Sun, ArrowLeft, Camera, Split,
  ArrowUpFromLine, Target, ArrowDownNarrowWide, Compass, Route
} from 'lucide-react';
import { fileToDataURL } from '../utils/silhouettes';
import { Exporter } from '../utils/exporters';
import { hasChildrenOrSubObjects } from '../utils/ungroup';

// ─── Tipos de label por categoría ────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  CUBE: 'Cubo', SPHERE: 'Esfera', CYLINDER: 'Cilindro', CONE: 'Cono',
  TORUS: 'Toroide', ICOSAHEDRON: 'Icosaedro', DODECAHEDRON: 'Dodecaedro',
  PYRAMID: 'Pirámide', PRISM: 'Prisma', CAPSULE: 'Cápsula',
  TETRAHEDRON: 'Tetraedro', OCTAHEDRON: 'Octaedro', TUBE: 'Tubo 3D',
  ARC: 'Arco 3D', STAR: 'Estrella 3D',
  WEDGE: 'Cuña', HEMISPHERE: 'Hemisferio',
  PLANE: 'Plano', CIRCLE: 'Círculo', RING: 'Anillo',
  SHAPE: 'Forma 2D', MESH: 'Malla',
};

const TYPE_COLORS: Record<string, string> = {
  CUBE: 'bg-blue-900/60 text-blue-300',
  SPHERE: 'bg-purple-900/60 text-purple-300',
  CYLINDER: 'bg-cyan-900/60 text-cyan-300',
  CONE: 'bg-orange-900/60 text-orange-300',
  TORUS: 'bg-pink-900/60 text-pink-300',
  ICOSAHEDRON: 'bg-emerald-900/60 text-emerald-300',
  PYRAMID: 'bg-yellow-900/60 text-yellow-300',
  PRISM: 'bg-emerald-900/60 text-emerald-300',
  CAPSULE: 'bg-teal-900/60 text-teal-300',
  TETRAHEDRON: 'bg-rose-900/60 text-rose-300',
  OCTAHEDRON: 'bg-violet-900/60 text-violet-300',
  TUBE: 'bg-fuchsia-900/60 text-fuchsia-300',
  ARC: 'bg-teal-900/60 text-teal-300',
  STAR: 'bg-yellow-900/60 text-yellow-300',
  WEDGE: 'bg-slate-700/60 text-slate-300',
  HEMISPHERE: 'bg-sky-900/60 text-sky-300',
  PLANE: 'bg-zinc-700/60 text-zinc-300',
  CIRCLE: 'bg-zinc-700/60 text-zinc-300',
  RING: 'bg-zinc-700/60 text-zinc-300',
  SHAPE: 'bg-indigo-900/60 text-indigo-300',
  MESH: 'bg-amber-900/60 text-amber-300',
};

const OPERATION_COLORS: Record<string, string> = {
  ADD:       'bg-emerald-600 text-white',
  SUBTRACT:  'bg-red-600 text-white',
  INTERSECT: 'bg-amber-600 text-white',
};
const OPERATION_LABELS: Record<string, string> = {
  ADD: 'Unión', SUBTRACT: 'Resta', INTERSECT: 'Intersección',
};

// ─── Micro-componentes ────────────────────────────────────────────────────────

import { motion, AnimatePresence } from 'framer-motion';

export const Section: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; badge?: React.ReactNode }> = ({
  title, icon, children, defaultOpen = true, badge
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/5 last:border-0">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => e.key === 'Enter' && setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3.5 hover:bg-white/[0.02] transition-all text-left group cursor-pointer"
      >
        <motion.span 
          animate={{ rotate: open ? 0 : -90 }}
          className="text-zinc-600 group-hover:text-zinc-400 flex-shrink-0"
        >
          <ChevronDown size={14}/>
        </motion.span>
        {icon && <span className="text-zinc-500 group-hover:text-indigo-400 transition-colors flex-shrink-0">{icon}</span>}
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500 group-hover:text-zinc-300 transition-colors flex-1">{title}</span>
        {badge}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'circOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-5 space-y-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const NumRow: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  slider?: boolean;
}> = ({ label, value, onChange, min, max, step = 0.01, unit, slider }) => (
  <div className="flex items-center gap-3">
    <span className="text-[10px] text-zinc-500 w-24 flex-shrink-0 font-bold uppercase tracking-wider">{label}</span>
    {slider && min !== undefined && max !== undefined ? (
      <div className="flex-1 flex items-center gap-3">
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="flex-1 h-1.5 accent-indigo-500 bg-zinc-800 rounded-full appearance-none cursor-pointer"
        />
        <span className="text-[10px] text-indigo-400 font-mono w-12 text-right flex-shrink-0 font-bold bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
          {value % 1 === 0 ? value : value.toFixed(2)}{unit ?? ''}
        </span>
      </div>
    ) : (
      <div className="flex-1 relative group">
        <input
          type="number" value={value} min={min} max={max} step={step}
          onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v); }}
          className="w-full px-3 py-2 bg-zinc-900/50 border border-white/5 rounded-lg text-[11px] text-zinc-200 font-mono focus:outline-none focus:border-indigo-500/50 focus:bg-zinc-800 transition-all shadow-inner"
        />
        {unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-zinc-600 group-focus-within:text-indigo-500">{unit}</span>}
      </div>
    )}
  </div>
);

const XYZRow: React.FC<{
  label: string;
  values: [number, number, number];
  onChange: (v: [number, number, number]) => void;
  step?: number;
  min?: number;
}> = ({ label, values, onChange, step = 0.01, min }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-600">{label}</span>
    </div>
    <div className="grid grid-cols-3 gap-2">
      {(['X', 'Y', 'Z'] as const).map((axis, i) => (
        <div key={axis} className="relative group">
          <div className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-1 h-3 rounded-full ${i===0?'bg-rose-500':i===1?'bg-emerald-500':'bg-sky-500'} opacity-50 group-focus-within:opacity-100 transition-opacity`}/>
          <input
            type="number" value={values[i]} step={step} min={min}
            onChange={e => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) {
                const next = [...values] as [number, number, number];
                next[i] = v;
                onChange(next);
              }
            }}
            className="w-full pl-5 pr-2 py-2 bg-zinc-900/50 border border-white/5 rounded-lg text-[10px] text-zinc-200 font-mono focus:outline-none focus:border-indigo-500/50 focus:bg-zinc-800 transition-all shadow-inner min-w-0"
          />
        </div>
      ))}
    </div>
  </div>
);

const RotationXYZRow: React.FC<{
  label: string;
  values: [number, number, number];
  onChange: (v: [number, number, number]) => void;
}> = ({ label, values, onChange }) => {
  const degrees = values.map(r => parseFloat(((r * 180) / Math.PI).toFixed(1))) as [number, number, number];

  const handleDegChange = (axisIdx: number, degVal: number) => {
    const nextRads = [...values] as [number, number, number];
    nextRads[axisIdx] = (degVal * Math.PI) / 180;
    onChange(nextRads);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-600">{label} (grados °)</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
          <div key={axis} className="relative group">
            <div className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-1 h-3 rounded-full ${i===0?'bg-rose-500':i===1?'bg-emerald-500':'bg-sky-500'} opacity-50 group-focus-within:opacity-100 transition-opacity`}/>
            <input
              type="number"
              value={degrees[i]}
              step={1}
              onChange={e => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) {
                  handleDegChange(i, v);
                }
              }}
              className="w-full pl-5 pr-3 py-2 bg-zinc-900/50 border border-white/5 rounded-lg text-[10px] text-zinc-200 font-mono focus:outline-none focus:border-indigo-500/50 focus:bg-zinc-800 transition-all shadow-inner min-w-0"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-zinc-500 font-mono">°</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Secciones específicas ───────────────────────────────────────────────────

const ParametersSection: React.FC<{ obj: CSGObject }> = ({ obj }) => {
  const updateParameters = useStore(s => s.updateParameters);
  const up = useCallback(
    (params: Partial<CSGObject['parameters']>) => updateParameters(obj.id, params),
    [obj.id, updateParameters],
  );

  const p = obj.parameters;

  switch (obj.type) {
    case 'PLANE':
      return (
        <Section title="Parámetros" defaultOpen>
          <NumRow label="Subdivisión" value={p.segments ?? 1} onChange={v => up({ segments: Math.max(1, Math.round(v)) })}
            min={1} max={256} step={1} slider/>
        </Section>
      );
    case 'CIRCLE':
      return (
        <Section title="Parámetros" defaultOpen>
          <NumRow label="Segmentos" value={p.segments ?? 16} onChange={v => up({ segments: Math.max(3, Math.round(v)) })}
            min={3} max={256} step={1} slider/>
        </Section>
      );
    case 'RING':
      return (
        <Section title="Parámetros" defaultOpen>
          <NumRow label="Radio Int." value={p.innerRadius ?? 0.25} onChange={v => up({ innerRadius: v })} min={0.01} step={0.05}/>
          <NumRow label="Radio Ext." value={p.outerRadius ?? 0.5} onChange={v => up({ outerRadius: v })} min={0.01} step={0.05}/>
          <NumRow label="Segmentos" value={p.thetaSegments ?? 16} onChange={v => up({ thetaSegments: Math.max(3, Math.round(v)) })}
            min={3} max={256} step={1} slider/>
        </Section>
      );
    case 'CUBE':
      return (
        <Section title="Parámetros" defaultOpen>
          <NumRow label="Subdivisión" value={p.segments ?? 1} onChange={v => up({ segments: Math.max(1, Math.round(v)) })}
            min={1} max={128} step={1} slider/>
        </Section>
      );
    case 'SPHERE':
      return (
        <Section title="Parámetros" defaultOpen>
          <NumRow label="Segmentos" value={p.segments ?? 32} onChange={v => up({ segments: Math.max(3, Math.round(v)) })}
            min={3} max={256} step={1} slider/>
        </Section>
      );
    case 'CYLINDER':
    case 'CONE':
    case 'PYRAMID':
    case 'PRISM':
      return (
        <Section title="Parámetros" defaultOpen>
          <NumRow label="Seg. radiales" value={p.segments ?? 32} onChange={v => up({ segments: Math.max(3, Math.round(v)) })}
            min={3} max={256} step={1} slider/>
          <NumRow label="Seg. altura" value={p.heightSegments ?? 1} onChange={v => up({ heightSegments: Math.max(1, Math.round(v)) })}
            min={1} max={128} step={1} slider/>
        </Section>
      );
    case 'CAPSULE':
    case 'HEMISPHERE':
      return (
        <Section title="Parámetros" defaultOpen>
          <NumRow label="Segmentos" value={p.segments ?? 32} onChange={v => up({ segments: Math.max(4, Math.round(v)) })}
            min={4} max={256} step={1} slider/>
        </Section>
      );
    case 'TUBE':
      return (
        <Section title="Parámetros" defaultOpen>
          <NumRow label="Radio interior" value={p.innerRadius ?? 0.25} onChange={v => up({ innerRadius: Math.max(0.01, v) })} min={0.01} max={10} step={0.05} slider/>
          <NumRow label="Radio exterior" value={p.outerRadius ?? 0.5} onChange={v => up({ outerRadius: Math.max(0.05, v) })} min={0.05} max={12} step={0.05} slider/>
          <NumRow label="Segmentos" value={p.segments ?? 32} onChange={v => up({ segments: Math.max(3, Math.round(v)) })} min={3} max={256} step={1} slider/>
        </Section>
      );
    case 'ARC':
      return (
        <Section title="Parámetros Arco 3D" defaultOpen>
          <NumRow label="Ángulo (°)" value={p.arcAngle ?? 180} onChange={v => up({ arcAngle: Math.max(1, Math.min(360, Math.round(v))) })} min={1} max={360} step={1} slider/>
          <NumRow label="Radio int." value={p.innerRadius ?? 0.25} onChange={v => up({ innerRadius: Math.max(0.01, v) })} min={0.01} max={10} step={0.05} slider/>
          <NumRow label="Radio ext." value={p.outerRadius ?? 0.5} onChange={v => up({ outerRadius: Math.max(0.05, v) })} min={0.05} max={12} step={0.05} slider/>
          <NumRow label="Altura" value={p.height ?? 0.5} onChange={v => up({ height: Math.max(0.05, v) })} min={0.05} max={10} step={0.05} slider/>
          <NumRow label="Segmentos" value={p.segments ?? 32} onChange={v => up({ segments: Math.max(3, Math.round(v)) })} min={3} max={256} step={1} slider/>
        </Section>
      );
    case 'STAR':
      return (
        <Section title="Parámetros Estrella 3D" defaultOpen>
          <NumRow label="Puntas" value={p.starPoints ?? p.points ?? 5} onChange={v => up({ starPoints: Math.max(3, Math.round(v)) })} min={3} max={32} step={1} slider/>
          <NumRow label="Radio int." value={p.innerRadius ?? 0.25} onChange={v => up({ innerRadius: Math.max(0.01, v) })} min={0.01} max={10} step={0.05} slider/>
          <NumRow label="Radio ext." value={p.outerRadius ?? 0.5} onChange={v => up({ outerRadius: Math.max(0.05, v) })} min={0.05} max={12} step={0.05} slider/>
          <NumRow label="Altura" value={p.height ?? 0.5} onChange={v => up({ height: Math.max(0.05, v) })} min={0.05} max={10} step={0.05} slider/>
        </Section>
      );
    case 'TORUS':
      return (
        <Section title="Parámetros" defaultOpen>
          <NumRow label="Radio" value={p.radius ?? 0.5} onChange={v => up({ radius: v })} min={0.05} step={0.05}/>
          <NumRow label="Tubo" value={p.tube ?? 0.2} onChange={v => up({ tube: v })} min={0.01} step={0.05}/>
          <NumRow label="Seg. radiales" value={p.radialSegments ?? 16} onChange={v => up({ radialSegments: Math.max(3, Math.round(v)) })}
            min={3} max={256} step={1} slider/>
          <NumRow label="Seg. tubulares" value={p.tubularSegments ?? 32} onChange={v => up({ tubularSegments: Math.max(6, Math.round(v)) })}
            min={6} max={512} step={2} slider/>
        </Section>
      );
    case 'ICOSAHEDRON':
    case 'DODECAHEDRON':
    case 'TETRAHEDRON':
    case 'OCTAHEDRON':
      return (
        <Section title="Parámetros" defaultOpen>
          <NumRow label="Detalle" value={p.detail ?? 0} onChange={v => up({ detail: Math.max(0, Math.round(v)) })}
            min={0} max={8} step={1} slider/>
        </Section>
      );
    case 'SHAPE':
      return (
        <Section title="Parámetros" defaultOpen>
          <NumRow label="Segmentos (Bezier)" value={p.segments ?? 20} onChange={v => up({ segments: Math.max(1, Math.round(v)) })}
            min={1} max={128} step={1} slider/>
          <NumRow label="Profundidad" value={p.extrusionDepth ?? 0} onChange={v => up({ extrusionDepth: v })}
            min={0} max={50} step={0.1} />
          {p.extrusionDepth !== undefined && p.extrusionDepth > 0 && (
            <NumRow label="Seg. Profundidad" value={p.depthSegments ?? 1} onChange={v => up({ depthSegments: Math.max(1, Math.round(v)) })}
              min={1} max={128} step={1} slider/>
          )}
        </Section>
      );
    default:
      return null;
  }
};

const GeneratedSection: React.FC<{ obj: CSGObject }> = ({ obj }) => {
  const updateObject = useStore(s => s.updateObject);
  const saveHistory  = useStore(s => s.saveHistory);
  const p = obj.parameters as Record<string, any>;
  const genType = p.genType;

  if (!genType || genType === 'mesh') return null;

  const regen = (newVerts: V3[], newFaces: MeshFace[], newParams: Record<string,any>) => {
    updateObject(obj.id, {
      vertices: newVerts,
      faces: newFaces,
      parameters: { ...obj.parameters, ...newParams },
    });
    saveHistory();
  };

  return (
    <Section title="Generador" icon={<RotateCw size={12}/>} defaultOpen>
      <div className="px-1.5 py-1 bg-indigo-900/30 border border-indigo-800/50 rounded text-[9px] text-indigo-300 mb-2 flex items-center gap-1.5">
        <Wand2 size={10}/>
        <span>Objeto Paramétrico: <span className="font-bold uppercase">{genType}</span></span>
      </div>
      
      <div className="space-y-3">
        {genType === 'polygon' && (
          <>
            <NumRow label="Lados" value={p.genSides ?? 6} onChange={v => {
              const {vertices, faces} = generatePolygon(v, p.genRadius ?? 1);
              regen(vertices, faces, { genSides: v });
            }} min={3} max={64} step={1} slider />
            <NumRow label="Radio" value={p.genRadius ?? 1} onChange={v => {
              const {vertices, faces} = generatePolygon(p.genSides ?? 6, v);
              regen(vertices, faces, { genRadius: v });
            }} min={0.1} max={10} step={0.1} />
          </>
        )}

        {genType === 'arc' && (
          <>
            <NumRow label="Radio" value={p.genRadius ?? 1} onChange={v => {
              const {vertices, faces} = generateArc(v, p.genStart ?? 0, p.genEnd ?? Math.PI, p.genSegs ?? 32, p.genFilled ?? true);
              regen(vertices, faces, { genRadius: v });
            }} min={0.1} max={10} step={0.1} />
            <NumRow label="Ángulo" value={(p.genEnd ?? Math.PI) * (180/Math.PI)} onChange={v => {
              const rad = v * (Math.PI/180);
              const {vertices, faces} = generateArc(p.genRadius ?? 1, p.genStart ?? 0, rad, p.genSegs ?? 32, p.genFilled ?? true);
              regen(vertices, faces, { genEnd: rad });
            }} min={1} max={360} step={1} slider />
            <NumRow label="Segmentos" value={p.genSegs ?? 32} onChange={v => {
              const {vertices, faces} = generateArc(p.genRadius ?? 1, p.genStart ?? 0, p.genEnd ?? Math.PI, v, p.genFilled ?? true);
              regen(vertices, faces, { genSegs: v });
            }} min={3} max={128} step={1} slider />
          </>
        )}

        {genType === 'lathe' && (
          <>
            <NumRow label="Segmentos" value={p.genSegs ?? 32} onChange={v => {
              const {vertices, faces} = latheMesh(p.genProf ?? 'circle', v, p.genAngle ?? 360);
              regen(vertices, faces, { genSegs: v });
            }} min={3} max={128} step={1} slider />
            <NumRow label="Ángulo" value={p.genAngle ?? 360} onChange={v => {
              const {vertices, faces} = latheMesh(p.genProf ?? 'circle', p.genSegs ?? 32, v);
              regen(vertices, faces, { genAngle: v });
            }} min={1} max={360} step={1} slider />
          </>
        )}

        {genType === 'sweep' && (
          <>
            <NumRow label="Longitud" value={p.genLen ?? 5} onChange={v => {
              const path = makeStraightPath(v);
              const {vertices, faces} = sweepMesh(p.genProf ?? 'circle', path);
              regen(vertices, faces, { genLen: v });
            }} min={0.1} max={20} step={0.1} />
          </>
        )}
      </div>
    </Section>
  );
};

const AlignSection: React.FC<{ obj: CSGObject }> = ({ obj }) => {
  const { project, selectedObjectIds, updateObject, saveHistory, recenterPivotObject } = useStore();
  
  const alignObjects = (axis: 'x'|'y'|'z', mode: 'min'|'center'|'max') => {
    const ids = (selectedObjectIds && selectedObjectIds.length > 1) ? selectedObjectIds : [obj.id];
    const selected = project.objects.filter(o => ids.includes(o.id));
    if (selected.length < 1) return;
    const axisIdx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    const positions = selected.map(o => o.transform.position[axisIdx]);
    const ref = mode === 'min' ? Math.min(...positions) : mode === 'max' ? Math.max(...positions) : positions.reduce((a,b)=>a+b,0)/positions.length;
    selected.forEach(o => {
      const pos = [...o.transform.position] as V3;
      pos[axisIdx] = ref;
      updateObject(o.id, { transform: { ...o.transform, position: pos } });
    });
    saveHistory();
  };

  const handleAlignToFloor = () => {
    const storeState = useStore.getState();
    const ids = (selectedObjectIds && selectedObjectIds.length > 1) ? selectedObjectIds : [obj.id];
    const selected = storeState.project.objects.filter(o => ids.includes(o.id));
    selected.forEach(targetObj => {
      let minYRel = 0;
      if (targetObj.vertices && targetObj.vertices.length > 0) {
        const euler = new THREE.Euler(targetObj.transform.rotation[0], targetObj.transform.rotation[1], targetObj.transform.rotation[2]);
        const scale = new THREE.Vector3(...targetObj.transform.scale);
        let min = Infinity;
        targetObj.vertices.forEach((v, idx) => {
          const off = targetObj.vertexOffsets?.[idx] ?? [0,0,0];
          const p = new THREE.Vector3((v[0]+off[0])*scale.x, (v[1]+off[1])*scale.y, (v[2]+off[2])*scale.z).applyEuler(euler);
          if (p.y < min) min = p.y;
        });
        if (isFinite(min)) minYRel = min;
      }
      storeState.updateObject(targetObj.id, {
        transform: {
          ...targetObj.transform,
          position: [targetObj.transform.position[0], -minYRel, targetObj.transform.position[2]]
        }
      });
    });
    storeState.saveHistory();
  };

  const handleCenterAllOrigin = () => {
    const storeState = useStore.getState();
    const ids = (selectedObjectIds && selectedObjectIds.length > 1) ? selectedObjectIds : [obj.id];
    ids.forEach(id => {
      const targetObj = storeState.project.objects.find(o => o.id === id);
      if (targetObj) {
        storeState.updateObject(id, {
          transform: {
            ...targetObj.transform,
            position: [0, 0, 0]
          }
        });
      }
    });
    storeState.saveHistory();
  };

  const handleCenterXZAndFloor = () => {
    const storeState = useStore.getState();
    const ids = (selectedObjectIds && selectedObjectIds.length > 1) ? selectedObjectIds : [obj.id];
    const selected = storeState.project.objects.filter(o => ids.includes(o.id));
    selected.forEach(targetObj => {
      let minYRel = 0;
      if (targetObj.vertices && targetObj.vertices.length > 0) {
        const euler = new THREE.Euler(targetObj.transform.rotation[0], targetObj.transform.rotation[1], targetObj.transform.rotation[2]);
        const scale = new THREE.Vector3(...targetObj.transform.scale);
        let min = Infinity;
        targetObj.vertices.forEach((v, idx) => {
          const off = targetObj.vertexOffsets?.[idx] ?? [0,0,0];
          const p = new THREE.Vector3((v[0]+off[0])*scale.x, (v[1]+off[1])*scale.y, (v[2]+off[2])*scale.z).applyEuler(euler);
          if (p.y < min) min = p.y;
        });
        if (isFinite(min)) minYRel = min;
      }
      storeState.updateObject(targetObj.id, {
        transform: {
          ...targetObj.transform,
          position: [0, -minYRel, 0]
        }
      });
    });
    storeState.saveHistory();
  };

  const rotateAxisByDegrees = (axis: 'x' | 'y' | 'z', deltaDeg: number) => {
    const storeState = useStore.getState();
    const ids = (selectedObjectIds && selectedObjectIds.length > 1) ? selectedObjectIds : [obj.id];
    const deltaRad = (deltaDeg * Math.PI) / 180;
    ids.forEach(id => {
      const targetObj = storeState.project.objects.find(o => o.id === id);
      if (!targetObj) return;
      const [rx, ry, rz] = targetObj.transform.rotation;
      let newRot: V3 = [rx, ry, rz];
      if (axis === 'x') newRot = [rx + deltaRad, ry, rz];
      if (axis === 'y') newRot = [rx, ry + deltaRad, rz];
      if (axis === 'z') newRot = [rx, ry, rz + deltaRad];

      storeState.updateObject(id, {
        transform: {
          ...targetObj.transform,
          rotation: newRot
        }
      });
    });
    storeState.saveHistory();
  };

  const handleFixLyingUpright = () => {
    const storeState = useStore.getState();
    const ids = (selectedObjectIds && selectedObjectIds.length > 1) ? selectedObjectIds : [obj.id];
    ids.forEach(id => {
      const targetObj = storeState.project.objects.find(o => o.id === id);
      if (!targetObj) return;
      const [rx, ry, rz] = targetObj.transform.rotation;
      const newRot: V3 = [rx + Math.PI / 2, ry, rz];

      let minYRel = 0;
      if (targetObj.vertices && targetObj.vertices.length > 0) {
        const euler = new THREE.Euler(newRot[0], newRot[1], newRot[2]);
        const scale = new THREE.Vector3(...targetObj.transform.scale);
        let min = Infinity;
        targetObj.vertices.forEach((v, idx) => {
          const off = targetObj.vertexOffsets?.[idx] ?? [0,0,0];
          const p = new THREE.Vector3((v[0]+off[0])*scale.x, (v[1]+off[1])*scale.y, (v[2]+off[2])*scale.z).applyEuler(euler);
          if (p.y < min) min = p.y;
        });
        if (isFinite(min)) minYRel = min;
      }

      storeState.updateObject(id, {
        transform: {
          ...targetObj.transform,
          rotation: newRot,
          position: [targetObj.transform.position[0], -minYRel, targetObj.transform.position[2]]
        }
      });
    });
    storeState.saveHistory();
  };

  const handleResetRotation = () => {
    const ids = (selectedObjectIds && selectedObjectIds.length > 1) ? selectedObjectIds : [obj.id];
    ids.forEach(id => {
      const targetObj = project.objects.find(o => o.id === id);
      if (!targetObj) return;
      updateObject(id, {
        transform: {
          ...targetObj.transform,
          rotation: [0, 0, 0]
        }
      });
    });
    saveHistory();
  };

  const handleAlignToAxes = () => {
    const ids = (selectedObjectIds && selectedObjectIds.length > 1) ? selectedObjectIds : [obj.id];
    const snap = (val: number) => Math.round(val / (Math.PI / 2)) * (Math.PI / 2);
    ids.forEach(id => {
      const targetObj = project.objects.find(o => o.id === id);
      if (targetObj) {
        updateObject(id, {
          transform: {
            ...targetObj.transform,
            rotation: [
              snap(targetObj.transform.rotation[0]),
              snap(targetObj.transform.rotation[1]),
              snap(targetObj.transform.rotation[2])
            ]
          }
        });
      }
    });
    saveHistory();
  };

  return (
    <Section title="Alinear / Pivote / Rotación" icon={<AlignCenterHorizontal size={12}/>} defaultOpen={true}>
      <div className="space-y-3">
        <button 
          onClick={() => recenterPivotObject(obj.id)} 
          className="w-full p-1.5 bg-amber-900/40 hover:bg-amber-800/60 border border-amber-500/30 rounded text-[10px] font-bold text-amber-200 flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
          title="Centra el origen / pivote de transformación exactamente en el centro geométrico del objeto sin mover su posición en la escena"
        >
          <Target size={12} className="text-amber-400" /> Centrar Pivote / Origen al Objeto
        </button>

        {/* Alineación en los 3 Ejes */}
        <div className="space-y-1.5 pt-1 border-t border-white/5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1">
            <AlignCenterHorizontal size={10} /> Alineación Automática en 3 Ejes
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            <button 
              onClick={handleCenterAllOrigin} 
              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 border border-white/10 rounded text-[10px] font-bold text-zinc-200 flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
              title="Mueve la posición del objeto exactamente al centro de los 3 ejes (0, 0, 0)"
            >
              <Target size={11} className="text-indigo-400" /> Centrar en (0, 0, 0)
            </button>
            <button 
              onClick={handleCenterXZAndFloor} 
              className="p-1.5 bg-indigo-900/40 hover:bg-indigo-800/60 border border-indigo-500/30 rounded text-[10px] font-bold text-indigo-200 flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
              title="Centra X=0, Z=0 en el origen y sienta la base sobre el suelo (Y=0)"
            >
              <ArrowUpFromLine size={11} className="rotate-180 text-indigo-400" /> Centrar XZ + Suelo
            </button>
          </div>
          <button 
            onClick={handleAlignToFloor} 
            className="w-full p-1.5 bg-zinc-800/80 hover:bg-zinc-700 border border-white/10 rounded text-[10px] font-bold text-zinc-200 flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
            title="Sienta la base inferior del objeto exactamente sobre el suelo (Y = 0)"
          >
            <ArrowUpFromLine size={11} className="rotate-180 text-emerald-400" /> Alinear Base al Suelo (Y=0)
          </button>
        </div>

        {/* Corregir Modelo Tumbado / Rotación Automática */}
        <div className="space-y-2 pt-2 border-t border-white/5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1">
              <RotateCw size={10} /> Corregir Orientación (Modelo Tumbado)
            </span>
            <button 
              onClick={handleResetRotation}
              className="text-[9px] text-zinc-400 hover:text-white underline cursor-pointer"
              title="Restablecer rotación a (0°, 0°, 0°)"
            >
              Reset 0°
            </button>
          </div>

          <button 
            onClick={handleFixLyingUpright}
            className="w-full p-2 bg-gradient-to-r from-violet-900/60 via-indigo-900/60 to-purple-900/60 hover:from-violet-800 hover:to-purple-800 border border-indigo-500/40 rounded-lg text-[10px] font-bold text-white flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer active:scale-[0.98]"
            title="Si el objeto importado (STL/OBJ/GLTF) aparece acostado/tumbado, esto lo endereza verticalmente (+90° X) y lo asienta en el suelo"
          >
            <RotateCw size={13} className="text-indigo-300" />
            Enderezar Modelo Tumbado (+90° X)
          </button>

          {/* Botones de Rotación Rápida por Eje */}
          <div className="space-y-1.5">
            <p className="text-[9px] text-zinc-500 font-semibold uppercase tracking-wider">Rotar en Ejes (+90° / -90° / 180°)</p>
            {(['x', 'y', 'z'] as const).map(axis => (
              <div key={axis} className="flex items-center gap-1">
                <span className={`w-12 text-[9px] font-mono font-bold uppercase px-1 py-0.5 rounded text-center shrink-0 ${axis==='x'?'bg-rose-950 text-rose-300 border border-rose-800/50':axis==='y'?'bg-emerald-950 text-emerald-300 border border-emerald-800/50':'bg-sky-950 text-sky-300 border border-sky-800/50'}`}>
                  Eje {axis.toUpperCase()}
                </span>
                <button
                  onClick={() => rotateAxisByDegrees(axis, 90)}
                  className="flex-1 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-[9px] font-mono font-bold text-zinc-200 transition-all border border-white/5 active:scale-95"
                  title={`Rotar +90° en eje ${axis.toUpperCase()}`}
                >
                  +{axis.toUpperCase()} 90°
                </button>
                <button
                  onClick={() => rotateAxisByDegrees(axis, -90)}
                  className="flex-1 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-[9px] font-mono font-bold text-zinc-200 transition-all border border-white/5 active:scale-95"
                  title={`Rotar -90° en eje ${axis.toUpperCase()}`}
                >
                  -{axis.toUpperCase()} 90°
                </button>
                <button
                  onClick={() => rotateAxisByDegrees(axis, 180)}
                  className="px-2 py-1 bg-zinc-800/80 hover:bg-zinc-700 rounded text-[9px] font-mono font-bold text-zinc-400 hover:text-white transition-all border border-white/5 active:scale-95"
                  title={`Invertir 180° en eje ${axis.toUpperCase()}`}
                >
                  180°
                </button>
              </div>
            ))}
          </div>

          <button 
            onClick={handleAlignToAxes} 
            className="w-full p-1.5 bg-zinc-800/60 hover:bg-zinc-700 border border-white/10 rounded text-[10px] font-bold text-zinc-300 flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
            title="Redondea la rotación actual a los ángulos ortogonales más cercanos (múltiplos de 90°)"
          >
            <Target size={11} className="text-zinc-400" /> Ajustar a Ángulos Ortogonales (90°)
          </button>
        </div>

        {/* Matriz Min / Cen / Max */}
        <div className="space-y-1 pt-2 border-t border-white/5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Alinear Relativo (Mín / Cen / Máx)</span>
          <div className="grid grid-cols-3 gap-1">
            {['x','y','z'].map(ax => (
              <React.Fragment key={ax}>
                <button onClick={()=>alignObjects(ax as any,'min')} className="p-1 bg-zinc-800/80 hover:bg-zinc-700 rounded text-[9px] font-mono">{ax.toUpperCase()} Min</button>
                <button onClick={()=>alignObjects(ax as any,'center')} className="p-1 bg-zinc-800/80 hover:bg-zinc-700 rounded text-[9px] font-mono">{ax.toUpperCase()} Cen</button>
                <button onClick={()=>alignObjects(ax as any,'max')} className="p-1 bg-zinc-800/80 hover:bg-zinc-700 rounded text-[9px] font-mono">{ax.toUpperCase()} Max</button>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
};

const ObjectMaterialSection: React.FC<{ obj: CSGObject }> = ({ obj }) => {
  const { project, updateObject, assignMaterialToObjects } = useStore();
  const m = obj.material;
  
  const handleAssign = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    assignMaterialToObjects([obj.id], val === 'none' ? null : val);
  };

  return (
    <Section title="Material del Objeto" icon={<Palette size={14}/>} defaultOpen={true}>
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Material de Proyecto</label>
          <select 
            value={obj.materialId || 'none'} 
            onChange={handleAssign}
            className="w-full bg-zinc-900/50 border border-white/5 rounded-xl px-3 py-2.5 text-[11px] text-zinc-200 focus:outline-none focus:border-indigo-500/50 transition-all appearance-none cursor-pointer shadow-inner"
          >
            <option value="none">Ninguno (Usar color base)</option>
            {project.materials.map(mat => (
              <option key={mat.id} value={mat.id}>{mat.name}</option>
            ))}
          </select>
        </div>

        <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5 space-y-4 shadow-xl">
          <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Propiedades Locales</p>
          <NumRow label="Rugosidad" value={m?.roughness ?? 0.5} onChange={v => updateObject(obj.id, { material: { ...m, roughness: v } })} min={0} max={1} slider />
          <NumRow label="Metálico" value={m?.metalness ?? 0} onChange={v => updateObject(obj.id, { material: { ...m, metalness: v } })} min={0} max={1} slider />
          
          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Usar POM</span>
            <button 
              onClick={() => updateObject(obj.id, { material: { ...m, useParallax: !m?.useParallax } })}
              className={`relative w-10 h-5 rounded-full transition-all ${m?.useParallax ? 'bg-indigo-600 shadow-lg shadow-indigo-500/20' : 'bg-zinc-800'}`}
            >
              <motion.div 
                animate={{ x: m?.useParallax ? 22 : 2 }}
                className="absolute top-1 w-3 h-3 rounded-full bg-white shadow-sm"
              />
            </button>
          </div>
          {m?.useParallax && (
            <motion.div initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}} className="space-y-4 pt-2">
              <NumRow label="Escala POM" value={m?.parallaxScale ?? 0.1} onChange={v => updateObject(obj.id, { material: { ...m, parallaxScale: v } })} min={0} max={0.5} step={0.01} slider />
              <NumRow label="Pasos POM" value={m?.parallaxSteps ?? 32} onChange={v => updateObject(obj.id, { material: { ...m, parallaxSteps: v } })} min={8} max={128} step={1} slider />
            </motion.div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/5">
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Color Base</span>
            <div className="relative group">
              <div className="w-10 h-10 rounded-xl border-2 border-white/10 shadow-lg transition-transform group-hover:scale-105" style={{ background: m?.color || obj.color || '#ffffff' }} />
              <input 
                type="color" 
                value={m?.color || obj.color || '#ffffff'} 
                onChange={e => updateObject(obj.id, { material: { ...m, color: e.target.value } })}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
};



const MeshModifiersSection: React.FC<{ obj: CSGObject }> = ({ obj }) => {
  const { smoothObject, roundAnglesObject, subdivideObject, optimizeObject, updateObject, fillHolesObject, capSelectedFacesObject, repairObject, weldObject, healObject, separateLoosePartsObject, shrinkWrapObject, editMode, selectedGLTFMeshes, setSelectedGLTFMeshes, isolateGLTFSelection, setIsolateGLTFSelection } = useStore();
  const [smoothFactor, setSmoothFactor] = useState(0.5);
  const [smoothIters, setSmoothIters] = useState(1);
  const [roundRadius, setRoundRadius] = useState(0.08);
  const [roundSegments, setRoundSegments] = useState(3);
  const [roundAngleThreshold, setRoundAngleThreshold] = useState(35);
  const [optimizeRatio, setOptimizeRatio] = useState(0.3);
  const [weldTolerance, setWeldTolerance] = useState(0.001);
  const [shrinkResolution, setShrinkResolution] = useState(3);
  const [isShrinkWrapping, setIsShrinkWrapping] = useState(false);
  const [isHealing, setIsHealing] = useState(false);
  const [isSeparating, setIsSeparating] = useState(false);
  const [separateMsg, setSeparateMsg] = useState<string | null>(null);
  const [meshSortMode, setMeshSortMode] = useState<'desc' | 'asc' | 'default'>('desc');
  const [meshSearch, setMeshSearch] = useState('');

  const sortedAndFilteredMeshes = useMemo(() => {
    if (!obj.meshData?.meshes) return [];
    let list = [...obj.meshData.meshes];
    if (meshSearch.trim()) {
      const q = meshSearch.toLowerCase();
      list = list.filter(m => m.name.toLowerCase().includes(q));
    }
    if (meshSortMode === 'desc') {
      return list.sort((a, b) => b.faces - a.faces);
    } else if (meshSortMode === 'asc') {
      return list.sort((a, b) => a.faces - b.faces);
    }
    return list;
  }, [obj.meshData?.meshes, meshSortMode, meshSearch]);

  const handleShrinkWrap = async () => {
    setIsShrinkWrapping(true);
    await shrinkWrapObject(obj.id, shrinkResolution);
    setIsShrinkWrapping(false);
  };

  const handleSeparateLooseParts = async () => {
    setIsSeparating(true);
    setSeparateMsg(null);
    const res = await useStore.getState().separateLoosePartsObject(obj.id);
    setIsSeparating(false);
    setSeparateMsg(res.message);
    setTimeout(() => setSeparateMsg(null), 5000);
  };

  const handleHeal = async () => {
    setIsHealing(true);
    await healObject(obj.id);
    setIsHealing(false);
  };

  const toggleMeshSelection = (meshId: string) => {
    setSelectedGLTFMeshes(
      selectedGLTFMeshes.includes(meshId) 
        ? selectedGLTFMeshes.filter(id => id !== meshId)
        : [...selectedGLTFMeshes, meshId]
    );
  };

  const selectAllMeshes = () => {
    if (obj.meshData?.meshes) {
      setSelectedGLTFMeshes(obj.meshData.meshes.map(m => m.id));
    }
  };

  const selectDenseMeshes = () => {
    if (obj.meshData?.meshes) {
      const dense = obj.meshData.meshes.filter(m => m.faces >= 2000).map(m => m.id);
      setSelectedGLTFMeshes(dense.length > 0 ? dense : obj.meshData.meshes.map(m => m.id));
    }
  };

  const deselectAllMeshes = () => {
    setSelectedGLTFMeshes([]);
  };

  const selectedStats = useMemo(() => {
    if (!obj.meshData?.meshes || selectedGLTFMeshes.length === 0) return null;
    return obj.meshData.meshes
      .filter(m => selectedGLTFMeshes.includes(m.id))
      .reduce((acc, m) => ({
        vertices: acc.vertices + m.vertices,
        faces: acc.faces + m.faces
      }), { vertices: 0, faces: 0 });
  }, [obj.meshData?.meshes, selectedGLTFMeshes]);

  return (
    <Section title="Malla" icon={<Wand2 size={12}/>} defaultOpen={false}>
      <div className="space-y-2">
        <div className="flex gap-1">
          <button onClick={() => updateObject(obj.id, { smoothShading: !obj.smoothShading })}
            className={`flex-1 py-1 rounded text-[10px] font-bold ${obj.smoothShading ? 'bg-indigo-600' : 'bg-zinc-800'}`}>
            Suave: {obj.smoothShading ? 'ON' : 'OFF'}
          </button>
          <button onClick={() => repairObject(obj.id)} className="flex-1 py-1 bg-emerald-800 hover:bg-emerald-700 rounded text-[10px] font-bold transition-colors" title="Soldar vértices y limpiar geometría">
            Reparar
          </button>
          <button 
            onClick={handleHeal} 
            disabled={isHealing}
            className={`flex-1 py-1 rounded text-[10px] font-bold transition-colors ${isHealing ? 'bg-zinc-700 animate-pulse' : 'bg-blue-800 hover:bg-blue-700'}`}
            title="Sana la malla usando Manifold (asegura que sea cerrada y estanca)"
          >
            {isHealing ? 'Sanando...' : 'Sanar'}
          </button>
        </div>
        <button onClick={() => subdivideObject(obj.id)} className="w-full py-1 bg-indigo-700 rounded text-[10px] font-bold">Subdividir</button>
        
        <div className="pt-1 pb-0.5">
          <button
            onClick={handleSeparateLooseParts}
            disabled={isSeparating}
            className={`w-full py-1.5 px-2 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1.5 transition-all shadow cursor-pointer ${
              isSeparating
                ? 'bg-purple-900/60 animate-pulse border border-purple-500/40'
                : 'bg-purple-700 hover:bg-purple-600 border border-purple-500/40 shadow-purple-950/30'
            }`}
            title="Separar por partes sueltas: Analiza conectividad y divide objetos o mallas unificadas en piezas independientes"
          >
            <Split size={12} />
            {isSeparating ? 'Analizando partes...' : 'Separar por partes sueltas'}
          </button>
          {separateMsg && (
            <div className="mt-1.5 p-1.5 bg-purple-950/80 border border-purple-500/40 rounded text-[9px] text-purple-200 text-center font-medium animate-fadeIn">
              {separateMsg}
            </div>
          )}
        </div>
        <div className="space-y-1.5 p-2 bg-zinc-900/60 border border-emerald-500/20 rounded-lg">
          <div className="flex items-center justify-between text-[9px] font-bold text-emerald-300 uppercase">
            <span>Unir / Soldar Vértices (Weld)</span>
          </div>
          <p className="text-[9px] text-zinc-400 leading-tight">
            Fusiona vértices desarticulados y elimina grietas entre polígonos para cerrar la malla.
          </p>
          <NumRow label="Distancia Max Soldado" value={weldTolerance} min={0.0001} max={0.05} step={0.0005} onChange={setWeldTolerance} slider />
          <div className="flex gap-1 pt-0.5">
            <button
              onClick={() => weldObject(obj.id, weldTolerance)}
              className="flex-1 py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded-md text-[10px] font-bold text-white transition-all shadow-sm cursor-pointer"
              title="Soldar vértices desarticulados dentro de la tolerancia seleccionada"
            >
              Soldar Vértices
            </button>
            <button
              onClick={handleHeal}
              disabled={isHealing}
              className={`flex-1 py-1.5 rounded-md text-[10px] font-bold text-white transition-all shadow-sm cursor-pointer ${
                isHealing ? 'bg-zinc-700 animate-pulse' : 'bg-blue-700 hover:bg-blue-600'
              }`}
              title="Curar topología usando Manifold 3D para obtener una malla 100% estanca/cerrada"
            >
              {isHealing ? 'Curando...' : 'Curar Malla (Manifold)'}
            </button>
          </div>
        </div>

        <div className="space-y-1.5 p-2 bg-zinc-900/60 border border-amber-500/20 rounded-lg">
          <div className="flex items-center justify-between text-[9px] font-bold text-amber-300 uppercase">
            <span>Redondear / Biselar Ángulos</span>
          </div>
          <p className="text-[9px] text-zinc-400 leading-tight">
            Suaviza únicamente los ángulos y bordes rectos o semirrectos con control de divisiones.
          </p>
          <NumRow label="Radio / Ancho" value={roundRadius} min={0.005} max={0.5} step={0.005} onChange={setRoundRadius} slider />
          <NumRow label="Divisiones" value={roundSegments} min={1} max={8} step={1} onChange={setRoundSegments} slider />
          <NumRow label="Ángulo Mínimo (°)" value={roundAngleThreshold} min={5} max={120} step={5} onChange={setRoundAngleThreshold} slider />
          <button 
            onClick={() => roundAnglesObject(obj.id, roundRadius, roundSegments, roundAngleThreshold)} 
            className="w-full py-1.5 bg-amber-600 hover:bg-amber-500 rounded-md text-[10px] font-bold text-white transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
            title="Redondea únicamente las aristas con ángulos rectos o afilados según el radio y divisiones configurados"
          >
            Redondear Ángulos Rectos
          </button>
        </div>

        <div className="space-y-1.5 p-2 bg-zinc-900/60 border border-indigo-500/20 rounded-lg">
          <div className="flex items-center justify-between text-[9px] font-bold text-indigo-300 uppercase">
            <span>Suavizado Laplaciano Fused</span>
          </div>
          <NumRow label="Factor Suavizado" value={smoothFactor} min={0.01} max={1} step={0.05} onChange={setSmoothFactor} slider />
          <NumRow label="Iteraciones" value={smoothIters} min={1} max={10} step={1} onChange={setSmoothIters} slider />
          <button 
            onClick={() => smoothObject(obj.id, smoothFactor, smoothIters)} 
            className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-md text-[10px] font-bold text-white transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            Aplicar Suavizado Malla
          </button>
        </div>
        <div className="space-y-1">
          <NumRow label={selectedGLTFMeshes.length > 0 ? "Ratio (Selección)" : "Ratio (Completo)"} value={optimizeRatio} min={0.01} max={0.95} step={0.01} onChange={setOptimizeRatio} slider />
          
          <div className="flex gap-1 py-0.5">
            <button onClick={() => setOptimizeRatio(0.05)} className={`flex-1 py-1 text-[9px] font-bold rounded border transition-colors ${optimizeRatio === 0.05 ? 'bg-violet-600 border-violet-400 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'}`} title="Reducción extrema al 5% de polígonos (-95%)">
              5% Ultra
            </button>
            <button onClick={() => setOptimizeRatio(0.20)} className={`flex-1 py-1 text-[9px] font-bold rounded border transition-colors ${optimizeRatio === 0.20 ? 'bg-violet-600 border-violet-400 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'}`} title="Reducción fuerte al 20% de polígonos (-80%)">
              20% Bajo
            </button>
            <button onClick={() => setOptimizeRatio(0.50)} className={`flex-1 py-1 text-[9px] font-bold rounded border transition-colors ${optimizeRatio === 0.50 ? 'bg-violet-600 border-violet-400 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'}`} title="Reducción moderada al 50% de polígonos (-50%)">
              50% Medio
            </button>
          </div>

          {obj.meshData?.type === 'gltf' && obj.meshData.meshes && obj.meshData.meshes.length > 0 && (
            <div className="mt-2 bg-zinc-900 border border-zinc-700 rounded p-2">
              <div className="flex justify-between items-center mb-1.5 gap-1">
                <span className="text-[10px] text-zinc-300 font-bold flex items-center gap-1">
                  Partes ({obj.meshData.meshes.length})
                </span>
                <div className="flex gap-1 items-center">
                  <button 
                    onClick={() => setMeshSortMode(prev => prev === 'desc' ? 'asc' : prev === 'asc' ? 'default' : 'desc')}
                    className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors flex items-center gap-1 ${
                      meshSortMode !== 'default' 
                        ? 'bg-amber-950/90 text-amber-300 border-amber-500/60 font-bold' 
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'
                    }`}
                    title={
                      meshSortMode === 'desc' 
                        ? "Orden actual: Mayor a Menor polígonos. Clic para Menor a Mayor" 
                        : meshSortMode === 'asc' 
                          ? "Orden actual: Menor a Mayor polígonos. Clic para Orden Original" 
                          : "Orden original. Clic para Ordenar Mayor a Menor"
                    }
                  >
                    <ArrowDownNarrowWide size={11} className={meshSortMode === 'asc' ? 'rotate-180 transition-transform' : ''} />
                    {meshSortMode === 'desc' ? 'Mayor-Menor' : meshSortMode === 'asc' ? 'Menor-Mayor' : 'Original'}
                  </button>
                  <button onClick={selectAllMeshes} className="text-[9px] bg-zinc-800 px-1 py-0.5 rounded hover:bg-zinc-700">Todas</button>
                  <button onClick={selectDenseMeshes} className="text-[9px] bg-purple-900/60 text-purple-200 border border-purple-500/30 px-1 py-0.5 rounded hover:bg-purple-800" title="Selecciona automáticamente las sub-mallas más densas (>2,000 polígonos)">Densas</button>
                  <button onClick={deselectAllMeshes} className="text-[9px] bg-zinc-800 px-1 py-0.5 rounded hover:bg-zinc-700">Ninguna</button>
                </div>
              </div>

              {obj.meshData.meshes.length > 5 && (
                <div className="mb-1.5">
                  <input
                    type="text"
                    placeholder="Buscar parte por nombre..."
                    value={meshSearch}
                    onChange={(e) => setMeshSearch(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                  />
                </div>
              )}

              <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                {sortedAndFilteredMeshes.map((mesh) => (
                  <label key={mesh.id} className="flex items-center gap-1.5 text-[10px] cursor-pointer hover:bg-zinc-800 p-1.5 rounded border border-transparent hover:border-zinc-700/50 transition-colors">
                    <input 
                      type="checkbox" 
                      className="accent-violet-600 w-3.5 h-3.5"
                      checked={selectedGLTFMeshes.includes(mesh.id)}
                      onChange={() => toggleMeshSelection(mesh.id)}
                    />
                    <span className="truncate flex-1 font-medium text-zinc-200" title={mesh.name}>{mesh.name}</span>
                    <span 
                      className="text-violet-300 font-mono text-[9px] bg-violet-950/70 px-1.5 py-0.5 rounded border border-violet-800/40 shrink-0 font-semibold"
                      title={`${mesh.faces.toLocaleString()} polígonos (caras) / ${mesh.vertices ? mesh.vertices.toLocaleString() : '-'} vértices`}
                    >
                      {mesh.faces.toLocaleString()} pol.
                    </span>
                  </label>
                ))}
              </div>
              
              <div className="mt-2 pt-2 border-t border-zinc-800 flex flex-col gap-1">
                <label className="flex items-center gap-2 text-[10px] cursor-pointer text-zinc-300 hover:text-white transition-colors">
                  <input 
                    type="checkbox" 
                    className="accent-violet-600 w-3 h-3"
                    checked={isolateGLTFSelection}
                    onChange={(e) => setIsolateGLTFSelection(e.target.checked)}
                  />
                  <span>Ver solo selección (Aislar)</span>
                </label>

                {selectedStats && (
                  <div className="bg-zinc-800/50 rounded p-1.5 text-[9px] text-zinc-400 flex justify-between items-center">
                    <span>Estadísticas selección:</span>
                    <span className="font-mono text-violet-400">{selectedStats.vertices.toLocaleString()}v | {selectedStats.faces.toLocaleString()}f</span>
                  </div>
                )}
              </div>

              <div className="text-[9px] text-zinc-500 mt-1 italic">
                {selectedGLTFMeshes.length === 0 ? 'Se optimizará todo el modelo con el ratio indicado.' : `Se optimizarán ${selectedGLTFMeshes.length} partes con el ratio indicado.`}
              </div>
            </div>
          )}

          <button onClick={() => optimizeObject(obj.id, optimizeRatio, selectedGLTFMeshes.length > 0 ? selectedGLTFMeshes : undefined)} className="w-full py-1 bg-violet-700 rounded text-[10px] font-bold mt-1">
            Optimizar {selectedGLTFMeshes.length > 0 ? 'Selección' : 'Completo'}
          </button>
        </div>

        <div className="space-y-1 pt-2 border-t border-white/5">
          <NumRow 
            label="Detalle Envolvente" 
            value={shrinkResolution} 
            min={1} 
            max={12} 
            step={1} 
            onChange={setShrinkResolution} 
            slider 
          />
          <button 
            onClick={handleShrinkWrap} 
            disabled={isShrinkWrapping}
            className={`w-full py-1.5 rounded text-[10px] font-bold text-white transition-all shadow cursor-pointer ${
              isShrinkWrapping 
                ? 'bg-emerald-900/60 animate-pulse border border-emerald-500/40' 
                : 'bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-600 hover:to-teal-600 shadow-teal-950/30'
            }`}
            title="Contrae una caja segmentada simple hasta que toque la superficie exterior del objeto, manteniendo ángulos y caras planas"
          >
            {isShrinkWrapping ? 'Ejecutando Shrink-Wrap...' : 'Remallado Envolvente (Shrink-Wrap)'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button onClick={() => fillHolesObject(obj.id)} className="py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-[10px] font-bold flex items-center justify-center gap-1 transition-colors" title="Cierra todos los huecos abiertos">
            <Wand2 size={10}/> Tapar Huecos
          </button>
          <button 
            disabled={editMode !== 'FACE'}
            onClick={() => capSelectedFacesObject(obj.id)} 
            className={`py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 transition-colors ${editMode === 'FACE' ? 'bg-teal-700 hover:bg-teal-600' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
            title="Cierra el hueco definido por las caras seleccionadas"
          >
            <Square size={10}/> Tapar Selección
          </button>
        </div>
      </div>
    </Section>
  );
};

const ValidationSection: React.FC<{ obj: CSGObject }> = ({ obj }) => {
  const { repairObject } = useStore();
  const [validResult, setValidResult] = useState<any>(null);

  const handleValidate = async () => {
    const { validateMesh } = await import('../utils/modifiers');
    setValidResult(validateMesh(obj));
  };

  return (
    <Section title="Validación" icon={<CheckCircle size={12}/>} defaultOpen={false}>
      <div className="space-y-2">
        {validResult && (
          <div className="text-[9px] text-zinc-400 bg-zinc-900 p-2 rounded">
            <p>Vértices: {validResult.vertexCount}</p>
            <p>Caras: {validResult.faceCount}</p>
            <p>Estado: {validResult.isValid ? '✅ Válido' : '❌ Errores'}</p>
          </div>
        )}
        <div className="flex gap-1">
          <button onClick={handleValidate} className="flex-1 py-1 bg-zinc-800 rounded text-[10px]">Validar</button>
          <button onClick={() => repairObject(obj.id)} className="flex-1 py-1 bg-emerald-800 rounded text-[10px]">Reparar</button>
        </div>
      </div>
    </Section>
  );
};

import { createNoiseTexture, createCheckerTexture, createWoodTexture, createOakPlanksTexture, createOakPlanksRoughnessMap, createOakPlanksAOMap } from '../utils/proceduralTextures';

import { MATERIAL_LIBRARY, MATERIAL_CATEGORIES, generateMaterial } from '../utils/proceduralTextures';



const LIGHT_ICONS: Record<string, string> = {
  POINT: '💡', DIRECTIONAL: '☀️', SPOT: '🔦', RECTAREA: '▭', AMBIENT: '🌍'
};
const LIGHT_LABELS: Record<string, string> = {
  POINT: 'Punto', DIRECTIONAL: 'Direccional', SPOT: 'Foco', RECTAREA: 'Área', AMBIENT: 'Ambiental'
};

const LightPropertiesSection: React.FC<{ light: any }> = ({ light }) => {
  const updateLight = useStore(s => s.updateLight);
  const removeLight = useStore(s => s.removeLight);
  const selectLight = useStore(s => s.selectLight);

  const up = (data: any) => updateLight(light.id, data);

  return (
    <div className="flex flex-col h-full">
      {/* Header con botón volver prominente */}
      <div className="flex-shrink-0 border-b border-white/5">
        {/* Botón volver */}
        <button
          onClick={() => selectLight(null)}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-all text-left group"
        >
          <div className="p-1.5 rounded-lg bg-zinc-900 border border-white/5 group-hover:bg-indigo-900/40 group-hover:border-indigo-500/30 transition-all">
            <ArrowLeft size={12} className="text-zinc-500 group-hover:text-indigo-400" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 group-hover:text-zinc-300 transition-colors">
            Volver a Iluminación
          </span>
        </button>

        {/* Identidad de la luz */}
        <div className="px-4 pb-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 shadow-xl border"
               style={{ background: `${light.color}11`, borderColor: `${light.color}33` }}>
            <span style={{ filter: 'drop-shadow(0 0 8px currentColor)' }}>{LIGHT_ICONS[light.type] || '💡'}</span>
          </div>
          <div className="flex-1 min-w-0">
            <input
              value={light.name}
              onChange={e => up({ name: e.target.value })}
              className="w-full bg-transparent text-[14px] font-bold text-zinc-100 focus:outline-none truncate placeholder:text-zinc-700"
              placeholder="Nombre de la luz"
            />
            <div className="flex items-center gap-2 mt-1">
              <select
                value={light.type}
                onChange={(e) => up({ type: e.target.value as any })}
                className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-300 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer hover:bg-zinc-800"
              >
                <option value="POINT">Punto</option>
                <option value="DIRECTIONAL">Direccional</option>
                <option value="SPOT">Foco</option>
                <option value="RECTAREA">Área</option>
                <option value="AMBIENT">Ambiental</option>
              </select>
            </div>
          </div>
          {/* Swatch de color */}
          <label className="cursor-pointer flex-shrink-0 relative group" title="Color de la luz">
            <div className="w-8 h-8 rounded-xl border-2 border-white/10 group-hover:border-white/30 shadow-lg transition-all overflow-hidden"
                 style={{ background: light.color }}>
              <input type="color" value={light.color} onChange={e => up({ color: e.target.value })}
                     className="opacity-0 w-0 h-0 absolute" />
            </div>
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 p-1">
        <Section title="Apariencia" icon={<Sun size={14}/>} defaultOpen>
          <NumRow label="Intensidad" value={light.intensity} onChange={v => up({ intensity: v })} min={0} max={20} step={0.1} slider />
          {(light.type === 'POINT' || light.type === 'SPOT') && (
            <>
              <NumRow label="Distancia" value={light.distance ?? 0} onChange={v => up({ distance: v })} min={0} max={100} step={1} slider />
              <NumRow label="Decaimiento" value={light.decay ?? 2} onChange={v => up({ decay: v })} min={0} max={10} step={0.1} slider />
            </>
          )}
          {light.type === 'SPOT' && (
            <>
              <NumRow label="Ángulo" value={light.angle ?? Math.PI/3} onChange={v => up({ angle: v })} min={0} max={Math.PI/2} step={0.01} slider />
              <NumRow label="Penumbra" value={light.penumbra ?? 0} onChange={v => up({ penumbra: v })} min={0} max={1} step={0.01} slider />
            </>
          )}
          {light.type === 'RECTAREA' && (
            <>
              <NumRow label="Ancho" value={light.width ?? 1} onChange={v => up({ width: v })} min={0.1} max={20} step={0.1} slider />
              <NumRow label="Alto" value={light.height ?? 1} onChange={v => up({ height: v })} min={0.1} max={20} step={0.1} slider />
            </>
          )}
          <div className="flex items-center justify-between py-2">
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Sombras</span>
            <button
              onClick={() => up({ castShadow: !light.castShadow })}
              className={`relative w-10 h-5 rounded-full transition-all ${light.castShadow ? 'bg-indigo-600 shadow-lg shadow-indigo-500/20' : 'bg-zinc-800'}`}
            >
              <motion.div 
                animate={{ x: light.castShadow ? 22 : 2 }}
                className="absolute top-1 w-3 h-3 rounded-full bg-white shadow-sm"
              />
            </button>
          </div>
        </Section>

        <Section title="Transformación" icon={<Move size={14}/>} defaultOpen>
          <XYZRow label="Posición" values={light.transform.position} onChange={v => up({ transform: { ...light.transform, position: v } })} step={0.1} />
          <XYZRow label="Rotación" values={light.transform.rotation} onChange={v => up({ transform: { ...light.transform, rotation: v } })} step={0.1} />
        </Section>
      </div>

      <div className="p-4 border-t border-white/5 flex-shrink-0 bg-zinc-950/20">
        <button onClick={() => { removeLight(light.id); }}
          className="w-full flex items-center justify-center gap-2 py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border border-rose-500/20">
          <Trash2 size={14}/> Eliminar luz
        </button>
      </div>
    </div>
  );
};

const HierarchyItem: React.FC<{ 
  id: string; 
  name: string; 
  type: string; 
  isSelected: boolean; 
  onSelect: (id: string, shift: boolean) => void;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  visible?: boolean;
  onToggleVisibility?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
}> = ({ id, name, type, isSelected, onSelect, children, icon, visible = true, onToggleVisibility, onDuplicate, onDelete }) => {
  const [isOpen, setIsOpen] = useState(true);
  const hasChildren = !!children;

  return (
    <div className="flex flex-col">
      <motion.div 
        layout
        onClick={(e) => onSelect(id, e.shiftKey || e.ctrlKey || e.metaKey)}
        className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all ${
          isSelected 
            ? 'bg-indigo-600/90 text-white shadow-lg shadow-indigo-500/20' 
            : 'hover:bg-white/[0.03] text-zinc-400 hover:text-zinc-200'
        }`}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {hasChildren ? (
            <button 
              onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
              className="p-1 hover:bg-white/10 rounded-md transition-colors"
            >
              <motion.div animate={{ rotate: isOpen ? 0 : -90 }}>
                <ChevronDown size={12} />
              </motion.div>
            </button>
          ) : (
            <div className="w-6" />
          )}
          <span className={`flex-shrink-0 transition-colors ${isSelected ? 'text-white' : 'text-zinc-500 group-hover:text-indigo-400'}`}>
            {icon || <Box size={14}/>}
          </span>
          <span className="text-[11px] font-medium truncate tracking-tight">{name || `Sin nombre (${type})`}</span>
        </div>
        
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          {onToggleVisibility && (
            <button 
              onClick={(e) => { e.stopPropagation(); onToggleVisibility(id); }}
              className={`p-1.5 rounded-md transition-colors ${isSelected ? 'hover:bg-white/20 text-white' : 'hover:bg-white/10 text-zinc-400'}`}
              title="Alternar visibilidad"
            >
              {visible ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
          )}
          {onDuplicate && (
            <button 
              onClick={(e) => { e.stopPropagation(); onDuplicate(id); }}
              className={`p-1.5 rounded-md transition-colors ${isSelected ? 'hover:bg-white/20 text-white' : 'hover:bg-white/10 text-zinc-400'}`}
              title="Duplicar"
            >
              <Copy size={12} />
            </button>
          )}
          {onDelete && (
            <button 
              onClick={(e) => { e.stopPropagation(); onDelete(id); }}
              className="p-1.5 rounded-md transition-colors text-rose-400 hover:bg-rose-500/20 hover:text-rose-300"
              title="Eliminar objeto"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </motion.div>
      <AnimatePresence>
        {hasChildren && isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="ml-5 border-l border-white/5 pl-2 mt-1 space-y-1 overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const CameraPropertiesSection: React.FC<{ camera: CameraObject }> = ({ camera }) => {
  const { updateCamera, selectCamera, project, addObject } = useStore();

  const handleChange = (field: keyof CameraObject, value: any) => {
    updateCamera(camera.id, { [field]: value });
  };

  const handleTransformChange = (field: keyof Transform, value: any) => {
    updateCamera(camera.id, { transform: { ...camera.transform, [field]: value } });
  };

  const filmGauge = camera.filmGauge || 35;
  const focalLength = filmGauge / (2 * Math.tan((camera.fov * Math.PI) / 360));

  const handleFocalLengthChange = (newFocalLength: number) => {
    const newFov = 2 * Math.atan(filmGauge / (2 * newFocalLength)) * (180 / Math.PI);
    updateCamera(camera.id, { fov: newFov, focalLength: newFocalLength });
  };

  const handleFilmGaugeChange = (newFilmGauge: number) => {
    const newFov = 2 * Math.atan(newFilmGauge / (2 * focalLength)) * (180 / Math.PI);
    updateCamera(camera.id, { fov: newFov, filmGauge: newFilmGauge });
  };

  const handleCreatePath = (type: 'CIRCLE' | 'SPIRAL' | 'SINE' = 'CIRCLE') => {
    let targetPos: V3 = [0, 2, 0];
    if (camera.targetObjectId) {
      const tgtObj = project.objects.find(o => o.id === camera.targetObjectId);
      if (tgtObj) targetPos = tgtObj.transform.position;
    }
    const newPath = createCameraPathObject(`Ruta_Camara_${camera.name}`, targetPos, 7, type);
    addObject(newPath);
    updateCamera(camera.id, {
      pathObjectId: newPath.id,
      followPathAnimation: true,
      pathProgress: 0,
    });
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => selectCamera(null)} className="p-2 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-white">
          <ChevronRight size={16} className="rotate-180" />
        </button>
        <div>
          <h3 className="text-sm font-bold text-white tracking-tight">{camera.name}</h3>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Propiedades de Cámara</p>
        </div>
      </div>

      {/* ── SEGUIMIENTO DE OBJETIVO (TARGET TRACKING) ── */}
      <div className="p-4 bg-indigo-950/30 rounded-2xl border border-indigo-500/20 space-y-3">
        <div className="flex items-center gap-2 text-indigo-400">
          <Target size={15} />
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Objetivo de Cámara (Look At)</h4>
        </div>
        
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-zinc-400">Marcar objeto objetivo a seguir</label>
          <select
            value={camera.targetObjectId || ''}
            onChange={(e) => handleChange('targetObjectId', e.target.value || null)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
          >
            <option value="">-- Ninguno (Dirección Libres / Libre) --</option>
            {project.objects.map(obj => (
              <option key={obj.id} value={obj.id}>
                🎯 {obj.name} ({obj.type})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── RUTA Y TRAYECTORIA DE CÁMARA (CAMERA PATH & CURVE MOVEMENT) ── */}
      <div className="p-4 bg-violet-950/30 rounded-2xl border border-violet-500/20 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-violet-400">
            <Route size={15} />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Ruta / Trayectoria de Cámara</h4>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-medium text-zinc-400">Objeto o Curva para el desplazamiento</label>
          <select
            value={camera.pathObjectId || ''}
            onChange={(e) => handleChange('pathObjectId', e.target.value || null)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500 transition-colors"
          >
            <option value="">-- Ninguna (Posición Estática) --</option>
            {project.objects.map(obj => (
              <option key={obj.id} value={obj.id}>
                🛣️ {obj.name}
              </option>
            ))}
          </select>

          {/* Botones de creación rápida de ruta */}
          <div className="flex gap-1.5 pt-1">
            <button
              onClick={() => handleCreatePath('CIRCLE')}
              className="flex-1 py-1.5 px-2 bg-violet-900/40 hover:bg-violet-800/60 border border-violet-700/50 rounded-lg text-[10px] font-bold text-violet-200 transition-all flex items-center justify-center gap-1">
              <Compass size={12} />
              + Crear Órbita
            </button>
            <button
              onClick={() => handleCreatePath('SPIRAL')}
              className="flex-1 py-1.5 px-2 bg-violet-900/40 hover:bg-violet-800/60 border border-violet-700/50 rounded-lg text-[10px] font-bold text-violet-200 transition-all flex items-center justify-center gap-1">
              <Route size={12} />
              + Espiral
            </button>
          </div>

          {camera.pathObjectId && (
            <div className="space-y-3 pt-2 border-t border-violet-500/20">
              <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={camera.followPathAnimation ?? true}
                  onChange={(e) => handleChange('followPathAnimation', e.target.checked)}
                  className="rounded bg-zinc-950 border-zinc-700 text-violet-500 focus:ring-0"
                />
                <span className="font-semibold text-violet-300">Sincronizar con Línea de Tiempo</span>
              </label>

              {!(camera.followPathAnimation ?? true) && (
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-zinc-400">Progreso en Ruta</span>
                    <span className="font-mono text-violet-300">{Math.round((camera.pathProgress || 0) * 100)}%</span>
                  </div>
                  <input
                    type="range" min="0" max="1" step="0.01"
                    value={camera.pathProgress || 0}
                    onChange={(e) => handleChange('pathProgress', parseFloat(e.target.value))}
                    className="w-full accent-violet-500 bg-zinc-900 rounded-lg h-1.5"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="p-4 bg-zinc-900/50 rounded-2xl border border-white/5 space-y-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Nombre</label>
          <input
            type="text"
            value={camera.name}
            onChange={(e) => handleChange('name', e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
        
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Tipo</label>
          <select
            value={camera.type}
            onChange={(e) => handleChange('type', e.target.value as any)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
          >
            <option value="PERSPECTIVE">Perspectiva</option>
            <option value="ORTHOGRAPHIC">Ortográfica</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            {camera.type === 'PERSPECTIVE' ? 'FOV (Campo de Visión)' : 'Tamaño (Size)'}
          </label>
          <div className="flex gap-2">
            {camera.type === 'PERSPECTIVE' ? (
              <>
                <input
                  type="range" min="10" max="120" step="1"
                  value={camera.fov}
                  onChange={(e) => handleChange('fov', parseFloat(e.target.value))}
                  className="flex-1 accent-indigo-500"
                />
                <span className="text-xs text-zinc-400 font-mono w-8 text-right">{Math.round(camera.fov)}°</span>
              </>
            ) : (
              <>
                <input
                  type="range" min="1" max="50" step="0.5"
                  value={camera.fov} // Reusing fov for orthographic size for simplicity
                  onChange={(e) => handleChange('fov', parseFloat(e.target.value))}
                  className="flex-1 accent-indigo-500"
                />
                <span className="text-xs text-zinc-400 font-mono w-8 text-right">{camera.fov}</span>
              </>
            )}
          </div>
        </div>

        {camera.type === 'PERSPECTIVE' && (
          <>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Distancia Focal (mm)</label>
              <div className="flex gap-2">
                <input
                  type="range" min="10" max="200" step="1"
                  value={focalLength}
                  onChange={(e) => handleFocalLengthChange(parseFloat(e.target.value))}
                  className="flex-1 accent-indigo-500"
                />
                <span className="text-xs text-zinc-400 font-mono w-10 text-right">{Math.round(focalLength)}mm</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Sensor de Cámara (mm)</label>
              <div className="flex gap-2">
                <input
                  type="range" min="10" max="100" step="1"
                  value={filmGauge}
                  onChange={(e) => handleFilmGaugeChange(parseFloat(e.target.value))}
                  className="flex-1 accent-indigo-500"
                />
                <span className="text-xs text-zinc-400 font-mono w-10 text-right">{Math.round(filmGauge)}mm</span>
              </div>
            </div>
          </>
        )}

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Near / Far</label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number" step="0.1"
              value={camera.near}
              onChange={(e) => handleChange('near', parseFloat(e.target.value))}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="Near"
            />
            <input
              type="number" step="1"
              value={camera.far}
              onChange={(e) => handleChange('far', parseFloat(e.target.value))}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="Far"
            />
          </div>
        </div>
      </div>

      <div className="p-4 bg-zinc-900/50 rounded-2xl border border-white/5 space-y-4">
        <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Transformación</h4>
        <XYZRow label="Posición" values={camera.transform.position} onChange={(v) => handleTransformChange('position', v)} step={0.1} />
        <XYZRow label="Rotación" values={camera.transform.rotation} onChange={(v) => handleTransformChange('rotation', v)} step={0.1} />
      </div>
    </div>
  );
};

const SceneManager: React.FC = () => {
  const { 
    project, updateEnvironment, addLight, selectLight, selectedLightId, updateLight, removeLight,
    addCamera, selectCamera, selectedCameraId, removeCamera,
    selectedObjectId, selectedObjectIds, selectObject, toggleObjectSelection,
    updateObject, removeObject, removeObjects, duplicateObject, selectedGLTFMeshes, toggleGLTFMeshSelection
  } = useStore();
  const env = project.environment;

  const selectedLight = project.lights.find(l => l.id === selectedLightId);
  const selectedCamera = (project.cameras || []).find(c => c.id === selectedCameraId);

  if (selectedLight) {
    return <LightPropertiesSection light={selectedLight} />;
  }

  if (selectedCamera) {
    return <CameraPropertiesSection camera={selectedCamera} />;
  }

  const hdriOptions = [
    { name: 'Ninguno',    url: null,   icon: '○' },
    { name: 'Atardecer',  url: 'https://threejs.org/examples/textures/equirectangular/venice_sunset_1k.hdr', icon: '🌅' },
    { name: 'Urbano',     url: 'https://threejs.org/examples/textures/equirectangular/pedestrian_overpass_1k.hdr', icon: '🏙️' },
    { name: 'Interior (Puente)', url: 'https://threejs.org/examples/textures/equirectangular/san_giuseppe_bridge_2k.hdr', icon: '🏛️' },
    { name: 'Noche',      url: 'https://threejs.org/examples/textures/equirectangular/moonless_golf_1k.hdr', icon: '🌙' },
    { name: 'Estudio',    url: 'https://threejs.org/examples/textures/equirectangular/quarry_01_1k.hdr', icon: '📸' },
  ];

  const handleHDRIUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const dataUrl = await fileToDataURL(file);
      const urlWithFilename = `${dataUrl}#${file.name}`;
      updateEnvironment({ hdriUrl: urlWithFilename });
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto custom-scrollbar p-1 space-y-1">
        <Section title="Entorno e Iluminación" icon={<Globe size={14}/>} defaultOpen>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {PRESET_HDRIS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => updateEnvironment({ hdriUrl: opt.url })}
                  className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all ${
                    env.hdriUrl === opt.url 
                      ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300 shadow' 
                      : 'bg-zinc-900/50 border-white/5 text-zinc-500 hover:bg-zinc-800 hover:border-white/10'
                  }`}
                  title={opt.desc}
                >
                  <span className="text-lg">{opt.icon}</span>
                  <span className="text-[9px] font-bold uppercase tracking-tighter truncate w-full text-center">{opt.name}</span>
                </button>
              ))}
              <label className="flex flex-col items-center justify-center gap-1 p-2 rounded-xl border border-dashed border-indigo-500/30 bg-indigo-950/20 text-indigo-300 hover:bg-indigo-900/30 hover:border-indigo-400 cursor-pointer transition-all">
                <Upload size={14} className="text-indigo-400" />
                <span className="text-[9px] font-bold uppercase tracking-tighter text-center">Subir HDR</span>
                <span className="text-[7.5px] text-zinc-400 text-center leading-tight">EXR, HDR, JPG</span>
                <input type="file" accept=".hdr,.exr,.png,.jpg,.jpeg,.webp,.avif" onChange={handleHDRIUpload} className="hidden" />
              </label>
            </div>

            <div className="space-y-3 pt-2">
              {/* Modo de Fondo */}
              <div>
                <span className="text-[10px] text-zinc-400 font-medium block mb-1">Modo de Fondo</span>
                <div className="grid grid-cols-2 gap-1 bg-zinc-900/80 p-1 rounded-xl border border-zinc-800">
                  {[
                    { id: 'GRADIENT', label: 'Estudio (Gradiente)' },
                    { id: 'HDRI',     label: 'Imagen HDRI' },
                    { id: 'COLOR',    label: 'Color Sólido' },
                    { id: 'TRANSPARENT', label: 'Transparente' },
                  ].map(m => {
                    const currentMode = env.backgroundMode || (env.backgroundVisible ? 'HDRI' : 'GRADIENT');
                    const active = currentMode === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => updateEnvironment({
                          backgroundMode: m.id as BackgroundMode,
                          backgroundVisible: m.id === 'HDRI' || m.id === 'GRADIENT',
                        })}
                        className={`py-1 px-1.5 rounded-lg text-[9.5px] font-bold transition-all ${
                          active
                            ? 'bg-indigo-600 text-white shadow'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                        }`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {(env.backgroundMode === 'HDRI' || (!env.backgroundMode && env.backgroundVisible)) && (
                <NumRow
                  label="Desenfoque Fondo (Bokeh)"
                  value={env.backgroundBlur ?? 0.25}
                  onChange={v => updateEnvironment({ backgroundBlur: v })}
                  min={0} max={1} step={0.05} slider
                />
              )}

              {env.backgroundMode === 'COLOR' && (
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] text-zinc-400 font-medium">Color de Fondo</span>
                  <input
                    type="color"
                    value={env.backgroundColor || '#16171d'}
                    onChange={e => updateEnvironment({ backgroundColor: e.target.value })}
                    className="w-8 h-6 bg-transparent rounded border border-zinc-700 cursor-pointer"
                  />
                </div>
              )}

              <NumRow label="Rotación Luz (Dirección)" value={env.rotation ?? 0} onChange={v => updateEnvironment({ rotation: v })} min={0} max={360} step={5} slider />
              <NumRow label="Intensidad HDRI" value={env.intensity} onChange={v => updateEnvironment({ intensity: v })} min={0.1} max={5} step={0.1} slider />
              <NumRow label="Exposición Cámara" value={env.exposure} onChange={v => updateEnvironment({ exposure: v })} min={0.2} max={5} step={0.1} slider />

              <div className="flex items-center justify-between px-1 pt-1">
                <span className="text-[10px] text-zinc-400 font-medium">Límite Res. (FPS)</span>
                <select
                  value={env.maxResolution || 2048}
                  onChange={e => updateEnvironment({ maxResolution: parseInt(e.target.value, 10) })}
                  className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-[10px] rounded px-2 py-1 font-mono focus:border-indigo-500"
                >
                  <option value={1024}>1K (Ultra FPS)</option>
                  <option value={2048}>2K (Recomendado)</option>
                  <option value={4096}>4K (Alta Calidad)</option>
                </select>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Jerarquía" icon={<Layers size={14}/>} defaultOpen badge={
          selectedObjectIds.length > 0 ? (
            <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
              {selectedObjectIds.length} sel.
            </span>
          ) : undefined
        }>
          <div className="space-y-2">
            {selectedObjectIds.length > 0 && (
              <div className="flex items-center justify-between gap-2 p-2 bg-indigo-950/40 border border-indigo-500/30 rounded-lg">
                <span className="text-[10px] text-indigo-200 font-medium truncate">
                  {selectedObjectIds.length} {selectedObjectIds.length === 1 ? 'objeto seleccionado' : 'objetos seleccionados'}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {selectedObjectIds.length > 1 && (
                    <button
                      onClick={() => {
                        selectedObjectIds.forEach(id => duplicateObject(id));
                      }}
                      className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 text-zinc-200 rounded text-[10px] font-bold transition-all"
                      title="Duplicar seleccionados"
                    >
                      <Copy size={11} /> Duplicar
                    </button>
                  )}
                  <button
                    onClick={() => removeObjects(selectedObjectIds)}
                    className="flex items-center gap-1 px-2 py-1 bg-rose-600/30 hover:bg-rose-600 text-rose-200 hover:text-white rounded text-[10px] font-bold transition-all border border-rose-500/30"
                    title="Eliminar objetos seleccionados"
                  >
                    <Trash2 size={11} /> Eliminar ({selectedObjectIds.length})
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
              {project.objects.map(obj => (
                <HierarchyItem
                  key={obj.id}
                  id={obj.id}
                  name={obj.name}
                  type={obj.type}
                  isSelected={selectedObjectIds.includes(obj.id)}
                  onSelect={(id, shift) => shift ? toggleObjectSelection(id, true) : selectObject(id)}
                  visible={obj.visible}
                  onToggleVisibility={(id) => updateObject(id, { visible: !obj.visible })}
                  onDuplicate={(id) => duplicateObject(id)}
                  onDelete={(id) => removeObject(id)}
                  icon={obj.meshData?.type === 'gltf' ? <ImageIcon size={12}/> : undefined}
                >
                  {obj.meshData?.type === 'gltf' && obj.meshData.meshes && (
                    <div className="space-y-0.5 mt-1">
                      {obj.meshData.meshes.map(mesh => (
                        <div 
                          key={mesh.id}
                          onClick={(e) => { e.stopPropagation(); toggleGLTFMeshSelection(mesh.id); }}
                          className={`flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer transition-all ${
                            selectedGLTFMeshes.includes(mesh.id) 
                              ? 'bg-violet-600/30 text-violet-200 border border-violet-500/30' 
                              : 'hover:bg-white/5 text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          <Box size={10} className="opacity-50" />
                          <span className="text-[9px] truncate font-medium">{mesh.name}</span>
                          <span 
                            className="ml-auto text-[8px] font-mono font-semibold text-violet-300 bg-violet-950/80 px-1.5 py-0.5 rounded border border-violet-800/40 shrink-0"
                            title={`${mesh.faces.toLocaleString()} polígonos`}
                          >
                            {mesh.faces.toLocaleString()} pol.
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </HierarchyItem>
              ))}
              {project.lights.map(light => (
                <HierarchyItem
                  key={light.id}
                  id={light.id}
                  name={light.name}
                  type={`Luz ${LIGHT_LABELS[light.type]}`}
                  isSelected={selectedLightId === light.id}
                  onSelect={(id) => selectLight(id)}
                  visible={light.visible}
                  onToggleVisibility={(id) => updateLight(id, { visible: !light.visible })}
                  onDelete={(id) => removeLight(id)}
                  icon={<span className="text-[10px]">{LIGHT_ICONS[light.type]}</span>}
                />
              ))}
              {project.cameras?.map(cam => (
                <HierarchyItem
                  key={cam.id}
                  id={cam.id}
                  name={cam.name}
                  type={`Cámara ${cam.type === 'PERSPECTIVE' ? 'Perspectiva' : 'Ortográfica'}`}
                  isSelected={selectedCameraId === cam.id}
                  onSelect={(id) => selectCamera(id)}
                  visible={true}
                  onToggleVisibility={() => {}}
                  onDelete={(id) => removeCamera(id)}
                  icon={<Camera size={12}/>}
                />
              ))}
              {project.objects.length === 0 && project.lights.length === 0 && (!project.cameras || project.cameras.length === 0) && (
                <div className="py-8 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-zinc-900 border border-white/5 flex items-center justify-center mx-auto text-zinc-700">
                    <Box size={16} />
                  </div>
                  <p className="text-[10px] text-zinc-600 font-medium italic">No hay objetos en la escena</p>
                </div>
              )}
            </div>
          </div>
        </Section>

        <Section title="Luces" icon={<Sun size={14}/>} defaultOpen badge={
          <div className="relative group/light-menu">
            <button 
              onClick={(e) => { e.stopPropagation(); }}
              className="p-1.5 rounded-lg bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all border border-indigo-500/20 flex items-center gap-1"
            >
              <Plus size={12} />
            </button>
            <div className="absolute right-0 top-full mt-1 w-32 bg-zinc-900 border border-white/10 rounded-xl shadow-xl opacity-0 invisible group-hover/light-menu:opacity-100 group-hover/light-menu:visible transition-all z-50 overflow-hidden">
              <button onClick={(e) => { e.stopPropagation(); addLight('POINT'); }} className="w-full text-left px-3 py-2 text-[10px] font-bold text-zinc-400 hover:text-white hover:bg-indigo-600/20 transition-colors">💡 Punto</button>
              <button onClick={(e) => { e.stopPropagation(); addLight('DIRECTIONAL'); }} className="w-full text-left px-3 py-2 text-[10px] font-bold text-zinc-400 hover:text-white hover:bg-indigo-600/20 transition-colors">☀️ Direccional</button>
              <button onClick={(e) => { e.stopPropagation(); addLight('SPOT'); }} className="w-full text-left px-3 py-2 text-[10px] font-bold text-zinc-400 hover:text-white hover:bg-indigo-600/20 transition-colors">🔦 Foco</button>
              <button onClick={(e) => { e.stopPropagation(); addLight('RECTAREA'); }} className="w-full text-left px-3 py-2 text-[10px] font-bold text-zinc-400 hover:text-white hover:bg-indigo-600/20 transition-colors">▭ Área</button>
              <button onClick={(e) => { e.stopPropagation(); addLight('AMBIENT'); }} className="w-full text-left px-3 py-2 text-[10px] font-bold text-zinc-400 hover:text-white hover:bg-indigo-600/20 transition-colors">🌍 Ambiental</button>
            </div>
          </div>
        }>
          <div className="space-y-1">
            {project.lights.map(light => (
              <button
                key={light.id}
                onClick={() => selectLight(light.id)}
                className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all group ${
                  selectedLightId === light.id 
                    ? 'bg-indigo-600/90 border-indigo-500/50 text-white shadow-lg shadow-indigo-500/20' 
                    : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:bg-zinc-800 hover:border-white/10'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg shadow-inner border ${
                  selectedLightId === light.id ? 'bg-white/20 border-white/20' : 'bg-zinc-950/50 border-white/5'
                }`} style={{ color: light.color }}>
                  {light.type === 'POINT' ? '💡' : light.type === 'DIRECTIONAL' ? '☀️' : light.type === 'SPOT' ? '🔦' : light.type === 'AMBIENT' ? '🌍' : '▭'}
                </div>
                <div className="flex-1 text-left">
                  <p className="text-[11px] font-bold truncate">{light.name}</p>
                  <p className={`text-[9px] font-medium uppercase tracking-widest opacity-60`}>
                    {light.type} • {light.intensity}cd
                  </p>
                </div>
                <ChevronRight size={14} className={`opacity-0 group-hover:opacity-100 transition-all ${selectedLightId === light.id ? 'text-white' : 'text-zinc-600'}`} />
              </button>
            ))}
            {project.lights.length === 0 && (
              <div className="py-6 text-center border border-dashed border-white/5 rounded-2xl bg-zinc-900/20">
                <p className="text-[10px] text-zinc-600 font-medium italic">No hay luces personalizadas</p>
              </div>
            )}
          </div>
        </Section>
        
        <Section title="Cámaras" icon={<Camera size={14}/>} defaultOpen badge={
          <button 
            onClick={(e) => { e.stopPropagation(); addCamera('PERSPECTIVE'); }}
            className="p-1.5 rounded-lg bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all border border-indigo-500/20"
          >
            <Plus size={12} />
          </button>
        }>
          <div className="space-y-1">
            {(project.cameras || []).map(cam => (
              <button
                key={cam.id}
                onClick={() => selectCamera(cam.id)}
                className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all group ${
                  selectedCameraId === cam.id 
                    ? 'bg-indigo-600/90 border-indigo-500/50 text-white shadow-lg shadow-indigo-500/20' 
                    : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:bg-zinc-800 hover:border-white/10'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg shadow-inner border ${
                  selectedCameraId === cam.id ? 'bg-white/20 border-white/20' : 'bg-zinc-950/50 border-white/5'
                }`}>
                  🎥
                </div>
                <div className="flex-1 text-left">
                  <p className="text-[11px] font-bold truncate">{cam.name}</p>
                  <p className={`text-[9px] font-medium uppercase tracking-widest opacity-60`}>
                    {cam.type} • {cam.fov}°
                  </p>
                </div>
                <ChevronRight size={14} className={`opacity-0 group-hover:opacity-100 transition-all ${selectedCameraId === cam.id ? 'text-white' : 'text-zinc-600'}`} />
              </button>
            ))}
            {(project.cameras || []).length === 0 && (
              <div className="py-6 text-center border border-dashed border-white/5 rounded-2xl bg-zinc-900/20">
                <p className="text-[10px] text-zinc-600 font-medium italic">No hay cámaras personalizadas</p>
              </div>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
};

const UngroupHeaderButton: React.FC<{ obj: CSGObject }> = ({ obj }) => {
  const ungroupSelectedObject = useStore(s => s.ungroupSelectedObject);
  const [isWorking, setIsWorking] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const canUngroup = hasChildrenOrSubObjects(obj);

  const handleUngroup = async () => {
    if (!canUngroup || isWorking) return;
    setIsWorking(true);
    setStatusMsg(null);
    const res = await ungroupSelectedObject(obj.id);
    setIsWorking(false);
    setStatusMsg(res.message);
    setTimeout(() => setStatusMsg(null), 4000);
  };

  return (
    <div className="mt-2 pt-2 border-t border-zinc-800/80">
      <button
        onClick={handleUngroup}
        disabled={!canUngroup || isWorking}
        className={`w-full py-1.5 px-2.5 rounded-lg text-[10px] font-bold flex items-center justify-center gap-2 transition-all shadow-md ${
          canUngroup
            ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white shadow-purple-950/40 border border-purple-400/40 cursor-pointer active:scale-[0.98]'
            : 'bg-zinc-800/60 text-zinc-500 border border-zinc-700/40 cursor-not-allowed opacity-60'
        }`}
        title="Desagrupar / Separar Conjunto: Extrae todos los sub-objetos del modelo y los posiciona de forma independiente en la escena"
      >
        <Split size={13} className={canUngroup ? 'text-purple-200 animate-pulse' : ''} />
        {isWorking ? 'Desagrupando objetos...' : 'Desagrupar / Separar Conjunto'}
      </button>
      {statusMsg && (
        <div className="mt-1 p-1 bg-purple-950/90 border border-purple-500/40 rounded text-[9px] text-purple-200 text-center font-medium animate-fadeIn">
          {statusMsg}
        </div>
      )}
    </div>
  );
};

export const PropertiesPanel: React.FC = () => {
  const {
    project, selectedObjectId, selectedObjectIds, updateObject, removeObject, removeObjects,
    duplicateObject, saveHistory, selectObject, toggleObjectSelection,
    moveObjectUp, moveObjectDown, selectedLightId, selectedCameraId,
    removeLight, removeCamera, selectLight, selectCamera, updateLight
  } = useStore();

  const [activeTab, setActiveTab] = useState<'PROPERTIES' | 'MATERIALS' | 'SCENE'>('PROPERTIES');
  const obj = project.objects.find(o => o.id === selectedObjectId);
  const [isExporting, setIsExporting] = useState(false);

  // Auto-switch tabs based on selection
  useEffect(() => {
    if (selectedLightId || selectedCameraId) {
      setActiveTab('SCENE');
    } else if (selectedObjectId) {
      setActiveTab('PROPERTIES');
    }
  }, [selectedObjectId, selectedLightId, selectedCameraId]);

  const handleExport = async (format: 'GLB' | 'GLTF' | 'OBJ') => {
    const objectsToExport = (selectedObjectIds && selectedObjectIds.length > 0)
      ? project.objects.filter(o => selectedObjectIds.includes(o.id))
      : obj ? [obj] : project.objects;

    if (objectsToExport.length === 0) return;

    setIsExporting(true);
    try {
      if (format === 'GLB') await Exporter.exportGLTF(objectsToExport, project.materials, true);
      else if (format === 'GLTF') await Exporter.exportGLTF(objectsToExport, project.materials, false);
      else if (format === 'OBJ') await Exporter.exportOBJ(objectsToExport, project.materials);
    } catch (e) {
      console.error('Export failed', e);
    } finally {
      setIsExporting(false);
    }
  };

  const handleAutoFitSelectedObject = async (targetObj: CSGObject) => {
    let targetObjOrGeo: THREE.Object3D | THREE.BufferGeometry | null = null;

    if (targetObj.meshData) {
      if (targetObj.meshData.type === 'obj') {
        targetObjOrGeo = await new Promise<THREE.Object3D>((res, rej) =>
          new OBJLoader().load(targetObj.meshData!.data, res, undefined, rej)
        ).catch(() => null);
      } else if (targetObj.meshData.type === 'stl') {
        targetObjOrGeo = await new Promise<THREE.BufferGeometry>((res, rej) =>
          new STLLoader().load(targetObj.meshData!.data, res, undefined, rej)
        ).catch(() => null);
      } else if (targetObj.meshData.type === 'gltf') {
        const gltf = await new Promise<any>((res, rej) => {
          const loader = new GLTFLoader();
          const dracoLoader = new DRACOLoader();
          dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
          loader.setDRACOLoader(dracoLoader);
          loader.load(targetObj.meshData!.data, res, undefined, rej);
        }).catch(() => null);
        if (gltf?.scene) targetObjOrGeo = gltf.scene;
      }
    } else if (targetObj.vertices && targetObj.vertices.length > 0) {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(targetObj.vertices.flat());
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      targetObjOrGeo = geo;
    }

    if (!targetObjOrGeo) return;

    const box = new THREE.Box3();
    if ((targetObjOrGeo as THREE.BufferGeometry).isBufferGeometry) {
      const geo = targetObjOrGeo as THREE.BufferGeometry;
      geo.computeBoundingBox();
      if (geo.boundingBox) box.copy(geo.boundingBox);
    } else {
      box.setFromObject(targetObjOrGeo as THREE.Object3D);
    }

    if (box.isEmpty() || !isFinite(box.min.x) || !isFinite(box.max.x)) return;

    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim === 0) return;

    const center = new THREE.Vector3();
    box.getCenter(center);

    const targetSize = 3.0;
    let scaleFactor = targetSize / maxDim;
    scaleFactor = parseFloat(scaleFactor.toFixed(4));

    const posX = parseFloat((-center.x * scaleFactor).toFixed(3));
    const posY = parseFloat((-box.min.y * scaleFactor).toFixed(3));
    const posZ = parseFloat((-center.z * scaleFactor).toFixed(3));

    updateObject(targetObj.id, {
      transform: {
        ...targetObj.transform,
        scale: [scaleFactor, scaleFactor, scaleFactor],
        position: [posX, posY, posZ],
      }
    });
    saveHistory();
  };

  return (
    <div className="h-full bg-zinc-950 border-l border-zinc-800 flex flex-col overflow-hidden select-none">
      
      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-zinc-800 bg-zinc-900/50">
        <button 
          onClick={() => setActiveTab('PROPERTIES')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-[10px] font-bold uppercase tracking-widest transition-all ${
            activeTab === 'PROPERTIES' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Settings size={14} /> Propiedades
        </button>
        <button 
          onClick={() => setActiveTab('MATERIALS')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-[10px] font-bold uppercase tracking-widest transition-all ${
            activeTab === 'MATERIALS' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Palette size={14} /> Materiales
        </button>
        <button 
          onClick={() => setActiveTab('SCENE')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-[10px] font-bold uppercase tracking-widest transition-all ${
            activeTab === 'SCENE' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Globe size={14} /> Escena
        </button>
      </div>

      {activeTab === 'MATERIALS' ? (
        <MaterialPanel />
      ) : activeTab === 'SCENE' ? (
        <SceneManager />
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* ── Propiedades del objeto ─────────────────────────────────────────── */}
          {!obj ? (
            <div className="flex-1 flex flex-col">
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center text-zinc-600">
                <Box size={24} className="opacity-20"/>
                <p className="text-[10px] uppercase tracking-widest font-bold">Propiedades</p>
                <p className="text-[10px] italic">Selecciona un objeto</p>
              </div>
              
              <div className="border-t border-zinc-800">
                <Section title="Exportar Proyecto" icon={<Download size={12}/>} defaultOpen={true}>
                  <div className="space-y-2">
                    <p className="text-[9px] text-zinc-500 leading-relaxed">
                      Exporta todo el proyecto actual con texturas.
                    </p>
                    <button 
                      disabled={isExporting}
                      onClick={() => handleExport('GLB')}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 rounded text-[10px] font-bold transition-all flex items-center justify-center gap-2"
                    >
                      <FileDown size={12}/> {isExporting ? 'Exportando...' : 'Exportar Proyecto (GLB)'}
                    </button>
                    <div className="grid grid-cols-2 gap-1">
                      <button 
                        disabled={isExporting}
                        onClick={() => handleExport('GLTF')}
                        className="py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:text-zinc-600 rounded text-[10px] font-bold transition-colors"
                      >
                        GLTF
                      </button>
                      <button 
                        disabled={isExporting}
                        onClick={() => handleExport('OBJ')}
                        className="py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:text-zinc-600 rounded text-[10px] font-bold transition-colors"
                      >
                        OBJ
                      </button>
                    </div>
                  </div>
                </Section>
              </div>
            </div>
          ) : (
            <>
              <div className="px-3 py-2 bg-zinc-900/40 border-b border-zinc-800">
                <input
                  value={obj.name}
                  onChange={e => updateObject(obj.id, { name: e.target.value })}
                  className="w-full bg-transparent text-[12px] font-bold text-zinc-100 focus:outline-none"
                />
                <div className="flex gap-1.5 mt-1">
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${TYPE_COLORS[obj.type] ?? 'bg-zinc-700'}`}>
                    {TYPE_LABELS[obj.type] ?? obj.type}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${OPERATION_COLORS[obj.operation]}`}>
                    {OPERATION_LABELS[obj.operation]}
                  </span>
                </div>
                <UngroupHeaderButton obj={obj} />
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800">
                <Section title="Apariencia" defaultOpen>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-500 w-20">Color</span>
                    <input type="color" value={obj.color} onChange={e => updateObject(obj.id, { color: e.target.value })} className="w-8 h-6 rounded bg-transparent cursor-pointer p-0" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-500 w-20">Operación</span>
                    <select 
                      value={obj.operation} 
                      onChange={e => updateObject(obj.id, { operation: e.target.value as any })}
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-1 py-1 text-[10px] text-zinc-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="ADD">Unión</option>
                      <option value="SUBTRACT">Resta</option>
                      <option value="INTERSECT">Intersección</option>
                    </select>
                  </div>
                  <NumRow label="Opacidad" value={obj.opacity ?? 1} onChange={v => updateObject(obj.id, { opacity: v })} min={0} max={1} slider />
                </Section>

                <Section title="Transformación" icon={<Move size={12}/>} defaultOpen>
                  <XYZRow label="Posición" values={obj.transform.position} onChange={v => updateObject(obj.id, { transform: { ...obj.transform, position: v } })} step={0.1} />
                  <RotationXYZRow label="Rotación" values={obj.transform.rotation} onChange={v => updateObject(obj.id, { transform: { ...obj.transform, rotation: v } })} />
                  <XYZRow label="Escala" values={obj.transform.scale} onChange={v => updateObject(obj.id, { transform: { ...obj.transform, scale: v } })} step={0.1} min={0.01} />
                  <button
                    onClick={() => handleAutoFitSelectedObject(obj)}
                    className="w-full mt-2 py-1.5 px-3 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    title="Ajusta automáticamente la escala y posición para que el objeto quepa perfectamente en la vista"
                  >
                    <Maximize2 size={12} />
                    Auto-escalar y Centrar
                  </button>
                </Section>

                <ParametersSection obj={obj}/>
                <GeneratedSection obj={obj}/>
                <AlignSection obj={obj}/>
                <ObjectMaterialSection obj={obj}/>
                <MeshModifiersSection obj={obj}/>
                <ValidationSection obj={obj}/>

                <Section title="Estadísticas" defaultOpen={false}>
                  <div className="grid grid-cols-2 gap-1">
                    <div className="bg-zinc-800 p-2 rounded border border-zinc-700/50">
                      <p className="text-[9px] text-zinc-300 uppercase">Vértices</p>
                      <p className="text-[13px] font-bold font-mono text-white">{obj.stats?.vertices ?? obj.vertices.length}</p>
                    </div>
                    <div className="bg-zinc-800 p-2 rounded border border-zinc-700/50">
                      <p className="text-[9px] text-zinc-300 uppercase">Caras</p>
                      <p className="text-[13px] font-bold font-mono text-white">{obj.stats?.faces ?? obj.faces.length}</p>
                    </div>
                  </div>
                </Section>

                <Section title="Exportar" icon={<Download size={12}/>} defaultOpen={false}>
                  <div className="space-y-2">
                    <p className="text-[9px] text-zinc-500 leading-relaxed">
                      Exporta la selección actual con texturas.
                    </p>
                    <button 
                      disabled={isExporting}
                      onClick={() => handleExport('GLB')}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 rounded text-[10px] font-bold transition-all flex items-center justify-center gap-2"
                    >
                      <FileDown size={12}/> {isExporting ? 'Exportando...' : 'Exportar GLB'}
                    </button>
                    <div className="grid grid-cols-2 gap-1">
                      <button 
                        disabled={isExporting}
                        onClick={() => handleExport('GLTF')}
                        className="py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:text-zinc-600 rounded text-[10px] font-bold transition-colors"
                      >
                        GLTF
                      </button>
                      <button 
                        disabled={isExporting}
                        onClick={() => handleExport('OBJ')}
                        className="py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:text-zinc-600 rounded text-[10px] font-bold transition-colors"
                      >
                        OBJ
                      </button>
                    </div>
                  </div>
                </Section>
              </div>

              <div className="p-2 border-t border-zinc-800 flex gap-1.5 bg-zinc-900/20">
                <button onClick={() => duplicateObject(obj.id)} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-[10px] font-semibold">
                  <Copy size={12}/> Duplicar
                </button>
                <button onClick={() => { removeObject(obj.id); }} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-red-900/40 hover:bg-red-800/60 text-red-300 rounded text-[10px] font-semibold">
                  <Trash2 size={12}/> Eliminar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};