import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { validateMesh } from '../utils/modifiers';
import { 
  Trash2, Copy, Eye, EyeOff, 
  ChevronDown, ChevronRight, Settings2, Layers, Sliders,
  AlignCenterHorizontal, AlignCenterVertical, AlignStartHorizontal,
  AlignEndHorizontal, AlignStartVertical, AlignEndVertical,
  CheckCircle2, AlertTriangle, Wrench
} from 'lucide-react';
import { CSGOperation, PrimitiveType } from '../types';

// ─── helpers ───────────────────────────────────────────────────────────────────

const Section = ({ title, icon: Icon, children, defaultOpen = true }: {
  title: string; icon: any; children: React.ReactNode; defaultOpen?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/5 last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 p-1.5 sm:p-2 hover:bg-white/5 transition-colors text-zinc-400 hover:text-zinc-200"
      >
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Icon size={12} />
        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest flex-1 text-left">{title}</span>
      </button>
      {isOpen && <div className="bg-black/20">{children}</div>}
    </div>
  );
};

// Numeric input + slider row
interface PropRowProps {
  label: string; value: number; min: number; max: number;
  step?: number; onChange: (v: number) => void; integer?: boolean;
}

const PropRow: React.FC<PropRowProps> = ({
  label, value, min, max, step = 0.01, onChange, integer = false,
}) => {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between">
        <label className="text-[9px] uppercase text-zinc-500 font-bold">{label}</label>
        <input
          type="number"
          value={isNaN(value) ? '' : (integer ? Math.round(value) : +value.toFixed(3))}
          min={min} max={max} step={step}
          onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(clamp(v)); }}
          className="w-16 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] text-right focus:outline-none focus:border-indigo-500"
        />
      </div>
      <input
        type="range" min={min} max={max} step={step}
        value={isNaN(value) ? min : value}
        onChange={e => onChange(clamp(parseFloat(e.target.value)))}
        className="w-full h-1 accent-indigo-500 cursor-pointer"
      />
    </div>
  );
};

// Select input row
const SelectRow = ({
  label, value, options, onChange
}: {
  label: string; value: string; options: { label: string; value: string }[]; onChange: (v: string) => void;
}) => (
  <div className="flex flex-col gap-1">
    <label className="text-[9px] uppercase text-zinc-500 font-bold">{label}</label>
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-zinc-800 border border-zinc-700 rounded px-1 py-1 text-[10px] focus:outline-none focus:border-indigo-500"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  </div>
);

// Transform XYZ row (position / rotation / scale)
const XYZRow = ({
  label, values, onChange, step = 0.01, min = -Infinity, max = Infinity,
}: {
  label: string;
  values: [number, number, number];
  onChange: (v: [number, number, number]) => void;
  step?: number; min?: number; max?: number;
}) => (
  <div className="flex flex-col gap-1">
    <label className="text-[9px] uppercase text-zinc-500 font-bold">{label}</label>
    <div className="grid grid-cols-3 gap-1">
      {(['X', 'Y', 'Z'] as const).map((ax, i) => (
        <div key={ax} className="flex items-center gap-1">
          <span className="text-[9px] font-bold" style={{ color: i===0?'#f87171':i===1?'#4ade80':'#60a5fa' }}>{ax}</span>
          <input
            type="number" step={step}
            value={+values[i].toFixed(3)}
            onChange={e => {
              const v = parseFloat(e.target.value);
              if (isNaN(v)) return;
              const next: [number,number,number] = [...values] as any;
              next[i] = Math.min(max, Math.max(min, v));
              onChange(next);
            }}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-[10px] focus:outline-none focus:border-indigo-500"
          />
        </div>
      ))}
    </div>
  </div>
);

// ─── Geometry params per type ──────────────────────────────────────────────────

type ParamDef = {
  key: string;
  label: string;
  type?: 'number' | 'select';
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  options?: { label: string; value: string }[];
  condition?: (p: any) => boolean;
};

const PARAM_DEFS: Record<PrimitiveType, ParamDef[]> = {
  CUBE: [
    { key: 'segments', label: 'Segmentos', min: 1, max: 20, step: 1, integer: true },
  ],
  SPHERE: [
    { 
      key: 'sphereType', label: 'Tipo', type: 'select', 
      options: [
        { label: 'Esfera UV', value: 'UV' }, 
        { label: 'Icoesfera', value: 'ICO' }
      ] 
    },
    { 
      key: 'segments', label: 'Segmentos (UV)', min: 3, max: 64, step: 1, integer: true,
      condition: (p) => !p.sphereType || p.sphereType === 'UV'
    },
    { 
      key: 'detail', label: 'Detalle (Ico)', min: 0, max: 5, step: 1, integer: true,
      condition: (p) => p.sphereType === 'ICO'
    },
  ],
  CYLINDER: [
    { key: 'segments', label: 'Segmentos radiales', min: 3, max: 64, step: 1, integer: true },
  ],
  CONE: [
    { key: 'segments', label: 'Segmentos radiales', min: 3, max: 64, step: 1, integer: true },
  ],
  TORUS: [
    { key: 'radius',          label: 'Radio mayor',    min: 0.1, max: 5,   step: 0.05 },
    { key: 'tube',            label: 'Radio tubo',     min: 0.01, max: 2,  step: 0.02 },
    { key: 'radialSegments',  label: 'Seg. radiales',  min: 3,  max: 32,   step: 1, integer: true },
    { key: 'tubularSegments', label: 'Seg. tubulares', min: 6,  max: 200,  step: 1, integer: true },
  ],
  ICOSAHEDRON: [
    { key: 'detail', label: 'Detalle', min: 0, max: 5, step: 1, integer: true },
  ],
  DODECAHEDRON: [
    { key: 'detail', label: 'Detalle', min: 0, max: 5, step: 1, integer: true },
  ],
  PLANE: [
    { key: 'segments', label: 'Segmentos', min: 1, max: 32, step: 1, integer: true },
  ],
  CIRCLE: [
    { key: 'segments', label: 'Segmentos', min: 3, max: 64, step: 1, integer: true },
  ],
  RING: [
    { key: 'innerRadius',   label: 'Radio interior', min: 0.01, max: 5, step: 0.05 },
    { key: 'outerRadius',   label: 'Radio exterior', min: 0.05, max: 6, step: 0.05 },
    { key: 'thetaSegments', label: 'Segmentos',      min: 3,    max: 64, step: 1, integer: true },
  ],
};

// ─── Align helpers ─────────────────────────────────────────────────────────────

type AlignAxis = 'x' | 'y' | 'z';
type AlignMode = 'min' | 'center' | 'max';

// ─── Main component ────────────────────────────────────────────────────────────

export const Sidebar: React.FC = () => {
  const {
    project, selectedObjectId, selectObject, removeObject, duplicateObject,
    updateObject, updateParameters, saveHistory,
    applyBoolean, smoothObject, optimizeObject, repairObject
  } = useStore();

  const objects = project.objects;
  const selectedId = selectedObjectId;
  const selectedObject = objects.find(o => o.id === selectedId);
  const selectedObjectIds = selectedId ? [selectedId] : [];

  // Local state for modifier sliders
  const [smoothFactor, setSmoothFactor] = useState(0.5);
  const [optimizeRatio, setOptimizeRatio] = useState(0.5);
  const [validationResult, setValidationResult] = useState<{ valid: boolean, errors: string[] } | null>(null);

  // ── Align selected objects to each other ──
  const alignObjects = (axis: AlignAxis, mode: AlignMode) => {
    // Use ALL selected objects for multi-select alignment
    const ids = selectedObjectIds;
    const selected = objects.filter(o => ids.includes(o.id));
    if (selected.length === 0) return;

    saveHistory();
    const axisIdx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    const positions = selected.map(o => o.transform.position[axisIdx]);
    const ref = mode === 'min' ? Math.min(...positions)
      : mode === 'max' ? Math.max(...positions)
      : positions.reduce((a, b) => a + b, 0) / positions.length;

    selected.forEach(o => {
      const pos: [number,number,number] = [...o.transform.position] as [number,number,number];
      pos[axisIdx] = ref;
      updateObject(o.id, { transform: { ...o.transform, position: pos } });
    });
  };

  // Snap selected object to world origin
  const snapToOrigin = () => {
    if (!selectedObject) return;
    saveHistory();
    updateObject(selectedObject.id, {
      transform: { ...selectedObject.transform, position: [0,0,0] }
    });
  };

  const resetRotation = () => {
    if (!selectedObject) return;
    saveHistory();
    updateObject(selectedObject.id, {
      transform: { ...selectedObject.transform, rotation: [0,0,0] }
    });
  };

  const resetScale = () => {
    if (!selectedObject) return;
    saveHistory();
    updateObject(selectedObject.id, {
      transform: { ...selectedObject.transform, scale: [1,1,1] }
    });
  };

  return (
    <div className="w-full h-full bg-zinc-950/70 backdrop-blur-xl border-l border-white/10 flex flex-col overflow-hidden text-zinc-300 select-none">

      {/* ── Hierarchy ── */}
      <Section title="Jerarquía" icon={Layers}>
        <div className="p-2 space-y-1 max-h-[180px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
          {objects.map(obj => (
            <div
              key={obj.id}
              onClick={(e) => {
                selectObject(obj.id);
              }}
              className={`group flex items-center gap-2 p-1.5 rounded cursor-pointer transition-all ${
                obj.id === selectedId
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'hover:bg-zinc-800'
              }`}
            >
              <div className="w-2 h-2 rounded-full ring-1 ring-white/10 flex-shrink-0" style={{ backgroundColor: obj.color }} />
              <span className="text-[11px] truncate flex-1 font-medium">{obj.name}</span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={e => { e.stopPropagation(); updateObject(obj.id, { visible: !obj.visible }); }} className="p-1 hover:bg-white/10 rounded">
                  {obj.visible ? <Eye size={10} /> : <EyeOff size={10} />}
                </button>
                <button onClick={e => { e.stopPropagation(); selectObject(obj.id); duplicateObject(obj.id); }} className="p-1 hover:bg-white/10 rounded">
                  <Copy size={10} />
                </button>
                <button onClick={e => { e.stopPropagation(); removeObject(obj.id); }} className="p-1 hover:bg-red-500/20 text-red-400 rounded">
                  <Trash2 size={10} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Properties ── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
        {(selectedObjectIds && selectedObjectIds.length > 1) && (
        <div className="px-3 py-1.5 bg-indigo-900/40 border-b border-indigo-500/20 text-[10px] text-indigo-300 font-medium">
          {selectedObjectIds.length} objetos seleccionados — Shift+clic para añadir/quitar
        </div>
      )}
      {selectedObject ? (
          <div className="flex flex-col">

            {/* General */}
            <Section title="General" icon={Settings2}>
              <div className="p-3 space-y-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] uppercase text-zinc-500 font-bold">Nombre</label>
                  <input
                    type="text"
                    value={selectedObject.name}
                    onChange={e => updateObject(selectedObject.id, { name: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] uppercase text-zinc-500 font-bold">Operación</label>
                    <select
                      value={selectedObject.operation}
                      onChange={e => updateObject(selectedObject.id, { operation: e.target.value as CSGOperation })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-1 py-1 text-[10px] focus:outline-none focus:border-indigo-500"
                    >
                      <option value="ADD">Unión</option>
                      <option value="SUBTRACT">Diferencia</option>
                      <option value="INTERSECT">Intersección</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] uppercase text-zinc-500 font-bold">Color</label>
                    <input
                      type="color"
                      value={selectedObject.color}
                      onChange={e => updateObject(selectedObject.id, { color: e.target.value })}
                      className="w-full h-7 bg-zinc-800 border border-zinc-700 rounded cursor-pointer p-0.5"
                    />
                  </div>
                  <div className="col-span-2">
                    <PropRow
                      label="Opacidad"
                      value={selectedObject.opacity ?? 1}
                      min={0} max={1} step={0.05}
                      onChange={v => updateObject(selectedObject.id, { opacity: v })}
                    />
                  </div>
                </div>
              </div>
            </Section>

            {/* Transform */}
            <Section title="Transformación" icon={Sliders}>
              <div className="p-3 space-y-3">
                <XYZRow
                  label="Posición"
                  values={selectedObject.transform.position as [number,number,number]}
                  step={0.1}
                  onChange={v => { saveHistory(); updateObject(selectedObject.id, { transform: { ...selectedObject.transform, position: v } }); }}
                />
                <XYZRow
                  label="Rotación (rad)"
                  values={selectedObject.transform.rotation as [number,number,number]}
                  step={0.05}
                  onChange={v => { saveHistory(); updateObject(selectedObject.id, { transform: { ...selectedObject.transform, rotation: v } }); }}
                />
                <XYZRow
                  label="Escala"
                  values={selectedObject.transform.scale as [number,number,number]}
                  step={0.05} min={0.01} max={100}
                  onChange={v => { saveHistory(); updateObject(selectedObject.id, { transform: { ...selectedObject.transform, scale: v } }); }}
                />
                {/* Quick reset buttons */}
                <div className="flex gap-1 pt-1">
                  <button onClick={snapToOrigin} className="flex-1 py-1 bg-zinc-800 hover:bg-zinc-700 text-[9px] rounded transition-colors">
                    Origen
                  </button>
                  <button onClick={resetRotation} className="flex-1 py-1 bg-zinc-800 hover:bg-zinc-700 text-[9px] rounded transition-colors">
                    Reset rot.
                  </button>
                  <button onClick={resetScale} className="flex-1 py-1 bg-zinc-800 hover:bg-zinc-700 text-[9px] rounded transition-colors">
                    Reset esc.
                  </button>
                </div>
              </div>
            </Section>

            {/* Geometry params */}
            <Section title="Geometría" icon={Sliders} defaultOpen={true}>
              <div className="p-3 space-y-3">
                {(PARAM_DEFS[selectedObject.type] || []).map(def => {
                  if (def.condition && !def.condition(selectedObject.parameters)) return null;

                  if (def.type === 'select' && def.options) {
                    return (
                      <SelectRow
                        key={def.key}
                        label={def.label}
                        value={(selectedObject.parameters as any)[def.key] ?? def.options[0].value}
                        options={def.options}
                        onChange={v => {
                          saveHistory();
                          updateParameters(selectedObject.id, { [def.key]: v });
                        }}
                      />
                    );
                  }

                  return (
                    <PropRow
                      key={def.key}
                      label={def.label}
                      value={(selectedObject.parameters as any)[def.key] ?? 0}
                      min={def.min!} max={def.max!}
                      step={def.step ?? 0.01}
                      integer={def.integer}
                      onChange={v => {
                        saveHistory();
                        updateParameters(selectedObject.id, { [def.key]: def.integer ? Math.round(v) : v });
                      }}
                    />
                  );
                })}
                {(PARAM_DEFS[selectedObject.type] || []).length === 0 && (
                  <p className="text-[10px] text-zinc-600 italic">Sin parámetros adicionales</p>
                )}
              </div>
            </Section>

            {/* Modifiers */}
            <Section title="Modificadores" icon={Settings2} defaultOpen={false}>
              <div className="p-3 space-y-4">
                
                {/* Boolean */}
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] uppercase text-zinc-500 font-bold">Operación Booleana</label>
                  <p className="text-[9px] text-zinc-600 italic">Aplica la operación actual con el objeto anterior.</p>
                  <button 
                    onClick={applyBoolean}
                    disabled={project.objects.findIndex(o => o.id === selectedObject.id) <= 0}
                    className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-[10px] font-medium rounded transition-colors"
                  >
                    Aplicar {selectedObject.operation === 'ADD' ? 'Unión' : selectedObject.operation === 'SUBTRACT' ? 'Diferencia' : 'Intersección'}
                  </button>
                </div>

                <div className="h-px bg-white/5" />

                {/* Smooth */}
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] uppercase text-zinc-500 font-bold">Suavizar Malla</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="range" min={0.1} max={1} step={0.1} 
                      value={smoothFactor} onChange={e => setSmoothFactor(parseFloat(e.target.value))}
                      className="flex-1 h-1 accent-indigo-500 cursor-pointer"
                    />
                    <span className="text-[10px] w-6 text-right">{smoothFactor}</span>
                  </div>
                  <button 
                    onClick={() => smoothObject(selectedObject.id, smoothFactor)}
                    className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-medium rounded transition-colors"
                  >
                    Suavizar
                  </button>
                </div>

                <div className="h-px bg-white/5" />

                {/* Optimize */}
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] uppercase text-zinc-500 font-bold">Optimizar (Reducir)</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="range" min={0.1} max={0.9} step={0.1} 
                      value={optimizeRatio} onChange={e => setOptimizeRatio(parseFloat(e.target.value))}
                      className="flex-1 h-1 accent-indigo-500 cursor-pointer"
                    />
                    <span className="text-[10px] w-6 text-right">{optimizeRatio}</span>
                  </div>
                  <button 
                    onClick={() => optimizeObject(selectedObject.id, optimizeRatio)}
                    className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-medium rounded transition-colors"
                  >
                    Optimizar
                  </button>
                </div>

              </div>
            </Section>

            {/* Validation / Repair */}
            <Section title="Validación y Reparación" icon={Wrench} defaultOpen={false}>
              <div className="p-3 space-y-3">
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={() => {
                      if (selectedObject) {
                        setValidationResult(validateMesh(selectedObject));
                      }
                    }}
                    className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-medium rounded transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={12} /> Comprobar Malla
                  </button>
                  
                  {validationResult && (
                    <div className={`p-2 rounded text-[10px] ${validationResult.valid ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                      {validationResult.valid ? (
                        <div className="flex items-center gap-1 font-bold"><CheckCircle2 size={10} /> Malla correcta</div>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 font-bold"><AlertTriangle size={10} /> Errores encontrados:</div>
                          <ul className="list-disc list-inside opacity-80">
                            {validationResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="h-px bg-white/5 my-1" />

                  <button 
                    onClick={() => {
                      repairObject(selectedObject.id);
                      // Re-validate after repair
                      setTimeout(() => {
                         const obj = useStore.getState().project.objects.find(o => o.id === selectedObject.id);
                         if(obj) setValidationResult(validateMesh(obj));
                      }, 50);
                    }}
                    className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-medium rounded transition-colors flex items-center justify-center gap-2"
                  >
                    <Wrench size={12} /> Reparar / Cerrar Huecos
                  </button>
                  <p className="text-[9px] text-zinc-600 italic">Intenta cerrar huecos y fusionar vértices sueltos.</p>
                </div>
              </div>
            </Section>

            {/* Align tools */}
            <Section title="Alinear" icon={AlignCenterHorizontal} defaultOpen={false}>
              <div className="p-3 space-y-2">
                <p className="text-[9px] text-zinc-500 mb-2">Alinear objeto seleccionado al mundo</p>
                <div className="grid grid-cols-3 gap-1">
                  <button onClick={() => alignObjects('x','min')}
                    className="flex flex-col items-center gap-1 p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-[9px] transition-colors" title="Alinear izquierda X">
                    <AlignStartHorizontal size={12} />X−
                  </button>
                  <button onClick={() => alignObjects('x','center')}
                    className="flex flex-col items-center gap-1 p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-[9px] transition-colors" title="Centrar X">
                    <AlignCenterHorizontal size={12} />X
                  </button>
                  <button onClick={() => alignObjects('x','max')}
                    className="flex flex-col items-center gap-1 p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-[9px] transition-colors" title="Alinear derecha X">
                    <AlignEndHorizontal size={12} />X+
                  </button>
                  <button onClick={() => alignObjects('y','min')}
                    className="flex flex-col items-center gap-1 p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-[9px] transition-colors" title="Alinear abajo Y">
                    <AlignStartVertical size={12} />Y−
                  </button>
                  <button onClick={() => alignObjects('y','center')}
                    className="flex flex-col items-center gap-1 p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-[9px] transition-colors" title="Centrar Y">
                    <AlignCenterVertical size={12} />Y
                  </button>
                  <button onClick={() => alignObjects('y','max')}
                    className="flex flex-col items-center gap-1 p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-[9px] transition-colors" title="Alinear arriba Y">
                    <AlignEndVertical size={12} />Y+
                  </button>
                  <button onClick={() => alignObjects('z','min')}
                    className="flex flex-col items-center gap-1 p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-[9px] transition-colors">
                    <AlignStartHorizontal size={12} className="rotate-90" />Z−
                  </button>
                  <button onClick={() => alignObjects('z','center')}
                    className="flex flex-col items-center gap-1 p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-[9px] transition-colors">
                    <AlignCenterHorizontal size={12} className="rotate-90" />Z
                  </button>
                  <button onClick={() => alignObjects('z','max')}
                    className="flex flex-col items-center gap-1 p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-[9px] transition-colors">
                    <AlignEndHorizontal size={12} className="rotate-90" />Z+
                  </button>
                </div>
              </div>
            </Section>

          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-600">
              <Layers size={24} />
            </div>
            <p className="text-zinc-600 text-xs italic leading-relaxed">
              Selecciona un objeto para ver sus propiedades
            </p>
          </div>
        )}
      </div>
    </div>
  );
};