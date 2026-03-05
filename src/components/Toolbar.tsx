import React, { useEffect, useRef, useState, createContext, useContext } from 'react';
import { useStore } from '../store/useStore';
import {
  Box, Circle, Cylinder, Cone, Undo2, Redo2, Save, FolderOpen,
  Download, Code, Maximize2, Disc, Square, Hexagon,
  MousePointer2, Dot, Move, RotateCw, Maximize, Spline, Layers3,
  Copy, Clipboard, FlipHorizontal, FlipVertical, Image as ImageIcon,
  ChevronDown,
} from 'lucide-react';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { performCSG, createPrimitiveMesh } from '../utils/csg';
import * as THREE from 'three';

const TooltipContext = createContext<((label: string | null, rect?: DOMRect) => void) | null>(null);

export const Toolbar: React.FC = () => {
  const {
    addObject, undo, redo, viewMode, setViewMode,
    editMode, setEditMode, transformMode, setTransformMode,
    transformSpace, setTransformSpace,
    project, setProject, currentTime,
    selectedObjectId, updateVertexOffsets, updateObject, selectedFaceIndices,
    saveHistory, setReference,
    copyObject, pasteObject, mirrorObject, duplicateObject,
  } = useStore();

  const [showMirror, setShowMirror] = useState(false);
  const [showRef, setShowRef]       = useState(false);
  const [extrudeDist, setExtrudeDist] = useState(0.3);
  const mirrorRef   = useRef<HTMLDivElement>(null);
  const refPanelRef = useRef<HTMLDivElement>(null);

  const [tooltip, setTooltip] = useState<{label:string, rect:DOMRect} | null>(null);
  const handleHover = (label: string | null, rect?: DOMRect) => {
    if (label && rect) setTooltip({ label, rect });
    else setTooltip(null);
  };

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); undo(); }
        if (e.key === 'y') { e.preventDefault(); redo(); }
        if (e.key === 'c') { e.preventDefault(); copyObject(); }
        if (e.key === 'v') { e.preventDefault(); pasteObject(); }
        if (e.key === 'd') { e.preventDefault(); if (selectedObjectId) duplicateObject(selectedObjectId); }
        return;
      }

      switch (e.key) {
        case 'g': setTransformMode('translate'); break;
        case 'r': setTransformMode('rotate'); break;
        case 's': setTransformMode('scale'); break;
        case 'Tab':
          e.preventDefault();
          setEditMode(editMode === 'OBJECT' ? 'FACE' : 'OBJECT');
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedObjectId) useStore.getState().removeObject(selectedObjectId);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editMode, selectedObjectId]);

  // ── Close dropdowns on outside click ─────────────────────────────────────
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (mirrorRef.current   && !mirrorRef.current.contains(e.target as Node))   setShowMirror(false);
      if (refPanelRef.current && !refPanelRef.current.contains(e.target as Node)) setShowRef(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // ── File ops ──────────────────────────────────────────────────────────────
  const handleSave = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = project.name + '.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoad = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = (e: any) => {
      const reader = new FileReader();
      reader.onload = (ev: any) => {
        try { setProject(JSON.parse(ev.target.result)); }
        catch { alert('Error al cargar'); }
      };
      reader.readAsText(e.target.files[0]);
    };
    input.click();
  };

  const handleExportSTL = () => {
    const mesh = performCSG(project.objects, currentTime);
    if (!mesh) { alert('No hay nada que exportar'); return; }
    const result = new STLExporter().parse(mesh);
    const url    = URL.createObjectURL(new Blob([result], { type: 'application/octet-stream' }));
    const a      = document.createElement('a');
    a.href = url; a.download = project.name + '.stl'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyJSON = () =>
    navigator.clipboard.writeText(JSON.stringify(project, null, 2)).then(() => alert('JSON copiado'));

  const handleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  };

  // ── Extrude ───────────────────────────────────────────────────────────────
  const handleExtrude = () => {
    if (!selectedObjectId || selectedFaceIndices.length === 0) {
      alert('Selecciona caras en modo Cara antes de extruir.');
      return;
    }
    // Extrude all selected faces at once — store handles unified mesh update and selection update
    useStore.getState().extrudeFaces(selectedObjectId, selectedFaceIndices, extrudeDist);
  };

  // ── Reference images ──────────────────────────────────────────────────────
  const loadRefImage = (view: 'top' | 'front' | 'side') => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      setReference(view, { url: URL.createObjectURL(file) });
    };
    input.click();
  };

  const canExtrude = editMode === 'FACE' && selectedFaceIndices.length > 0;
  const hasSel     = !!selectedObjectId;

  return (
    <TooltipContext.Provider value={handleHover}>
      <div className="h-14 bg-zinc-950 border-b border-zinc-800 flex items-center px-3 justify-between text-zinc-300 overflow-x-auto no-scrollbar select-none relative">

        {/* ── Left group ── */}
        <div className="flex items-center gap-2 flex-shrink-0">

          {/* Brand */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white font-bold text-sm">C</div>
            <span className="font-bold text-sm tracking-tight hidden lg:block">Editor CSG Pro</span>
          </div>
          <Sep/>

          {/* Primitives */}
          <div className="flex items-center gap-0.5">
            <TB icon={<Box size={17}/>}      label="Cubo"        onClick={() => addObject('CUBE')}/>
            <TB icon={<Circle size={17}/>}   label="Esfera"      onClick={() => addObject('SPHERE')}/>
            <TB icon={<Cylinder size={17}/>} label="Cilindro"    onClick={() => addObject('CYLINDER')}/>
            <TB icon={<Cone size={17}/>}     label="Cono"        onClick={() => addObject('CONE')}/>
            <TB icon={<Disc size={17}/>}     label="Toro"        onClick={() => addObject('TORUS')}/>
            <TB icon={<Hexagon size={17}/>}  label="Icosaedro"   onClick={() => addObject('ICOSAHEDRON')}/>
            <TB icon={<Square size={17}/>}   label="Plano"       onClick={() => addObject('PLANE')}/>
            <TB icon={<Circle size={17} strokeWidth={5}/>} label="Anillo" onClick={() => addObject('RING')}/>
          </div>
          <Sep/>

          {/* Edit mode */}
          <div className="flex items-center bg-zinc-900 rounded p-0.5">
            <MB active={editMode==='OBJECT'} onClick={() => setEditMode('OBJECT')} title="Objeto (Tab)"><MousePointer2 size={15}/></MB>
            <MB active={editMode==='VERTEX'} onClick={() => setEditMode('VERTEX')} title="Vértice"><Dot size={15}/></MB>
            <MB active={editMode==='EDGE'}   onClick={() => setEditMode('EDGE')}   title="Lado"><Spline size={15}/></MB>
            <MB active={editMode==='FACE'}   onClick={() => setEditMode('FACE')}   title="Cara (Tab)"><Square size={15}/></MB>
          </div>
          <Sep/>

          {/* Transform mode */}
          <div className="flex items-center bg-zinc-900 rounded p-0.5">
            <MB active={transformMode==='translate'} onClick={() => setTransformMode('translate')} title="Mover (G)"><Move size={15}/></MB>
            <MB active={transformMode==='rotate'}    onClick={() => setTransformMode('rotate')}    title="Rotar (R)"><RotateCw size={15}/></MB>
            <MB active={transformMode==='scale'}     onClick={() => setTransformMode('scale')}     title="Escalar (S)"><Maximize size={15}/></MB>
          </div>

          <button onClick={() => setTransformSpace(transformSpace==='world'?'local':'world')}
            className="px-2 py-1 bg-zinc-900 rounded text-[10px] font-bold hover:bg-zinc-800 transition-colors"
            title="Espacio mundo / local">
            {transformSpace==='world' ? 'MUNDO' : 'LOCAL'}
          </button>
          <Sep/>

          {/* Copy / Paste / Duplicate */}
          <div className="flex items-center gap-0.5">
            <TB icon={<Copy size={15}/>}      label="Copiar (Ctrl+C)"    onClick={copyObject}                                      disabled={!hasSel}/>
            <TB icon={<Clipboard size={15}/>} label="Pegar (Ctrl+V)"     onClick={pasteObject}/>
            <TB icon={<Copy size={14} className="opacity-60"/>} label="Duplicar (Ctrl+D)" onClick={() => hasSel && duplicateObject(selectedObjectId!)} disabled={!hasSel}/>
          </div>
          <Sep/>

          {/* Mirror dropdown */}
          <div className="relative" ref={mirrorRef}>
            <button onClick={() => setShowMirror(v => !v)} disabled={!hasSel}
              className={'flex items-center gap-1 px-2 py-1.5 rounded text-[11px] font-semibold transition-all '
                +(hasSel ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200' : 'bg-zinc-900 text-zinc-600 cursor-not-allowed')}
              title="Espejo / Simetría">
              <FlipHorizontal size={14}/><span className="hidden sm:inline">Espejo</span><ChevronDown size={11}/>
            </button>
            {showMirror && hasSel && mirrorRef.current && (
              <div 
                className="fixed mt-1 bg-zinc-900 border border-zinc-700 rounded shadow-xl z-[100] w-36"
                style={{ 
                  top: mirrorRef.current.getBoundingClientRect().bottom, 
                  left: mirrorRef.current.getBoundingClientRect().left 
                }}
              >
                {(['x','y','z'] as const).map(ax => (
                  <button key={ax} onClick={() => { mirrorObject(selectedObjectId!, ax); setShowMirror(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 text-left text-[11px]">
                    <FlipHorizontal size={12}/> Espejo {ax.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Extrude — with adjustable distance */}
          <div className="flex items-center gap-1">
            <button onClick={handleExtrude} disabled={!canExtrude}
              className={'flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold transition-all '
                +(canExtrude ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg' : 'bg-zinc-800 text-zinc-600 cursor-not-allowed')}
              title="Extruir cara seleccionada (modo Cara)">
              <Layers3 size={14}/><span className="hidden sm:inline">Extruir</span>
            </button>
            <input
              type="number" value={extrudeDist} step={0.05} min={0.01}
              onChange={e => setExtrudeDist(parseFloat(e.target.value) || 0.1)}
              className="w-14 px-1 py-1 text-[11px] bg-zinc-900 border border-zinc-700 rounded text-zinc-300 text-center"
              title="Distancia de extrusión"
            />
          </div>
          <Sep/>

          {/* Reference images */}
          <div className="relative" ref={refPanelRef}>
            <button onClick={() => setShowRef(v => !v)}
              className="flex items-center gap-1 px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-[11px] font-semibold transition-colors"
              title="Imágenes de referencia">
              <ImageIcon size={14}/><span className="hidden sm:inline">Ref.</span><ChevronDown size={11}/>
            </button>
            {showRef && refPanelRef.current && (
              <div 
                className="fixed mt-1 bg-zinc-900 border border-zinc-700 rounded shadow-xl z-[100] w-64 p-3 space-y-3"
                style={{ 
                  top: refPanelRef.current.getBoundingClientRect().bottom, 
                  left: refPanelRef.current.getBoundingClientRect().left 
                }}
              >
                <p className="text-[10px] font-bold uppercase text-zinc-500">Imágenes de referencia</p>
                {(['top','front','side'] as const).map(view => {
                  const ref   = project.references?.[view];
                  const label = view==='top' ? 'Superior (planta)' : view==='front' ? 'Frontal' : 'Lateral';
                  return (
                    <div key={view} className="space-y-1.5 border-t border-zinc-800 pt-2 first:border-0 first:pt-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-zinc-300">{label}</span>
                        <div className="flex gap-1">
                          <button onClick={() => loadRefImage(view)}
                            className="px-2 py-0.5 bg-zinc-700 hover:bg-zinc-600 rounded text-[9px]">
                            {ref?.url ? 'Cambiar' : '+ Cargar'}
                          </button>
                          {ref?.url && (
                            <button onClick={() => setReference(view, { url: null })}
                              className="px-2 py-0.5 bg-red-900/50 hover:bg-red-800 rounded text-[9px] text-red-300">✕</button>
                          )}
                        </div>
                      </div>
                      {ref?.url && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-zinc-500 w-14">Opacidad</span>
                            <input type="range" min={0} max={1} step={0.05} value={ref.opacity ?? 0.5}
                              onChange={e => setReference(view, { opacity: parseFloat(e.target.value) })}
                              className="flex-1 h-1 accent-indigo-500"/>
                            <span className="text-[9px] text-zinc-400 w-7">{Math.round((ref.opacity ?? 0.5)*100)}%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-zinc-500 w-14">Tamaño</span>
                            <input type="range" min={0.5} max={20} step={0.5} value={ref.scale?.[0] ?? 5}
                              onChange={e => { const v = parseFloat(e.target.value); setReference(view, { scale: [v,v,v] }); }}
                              className="flex-1 h-1 accent-indigo-500"/>
                            <span className="text-[9px] text-zinc-400 w-7">{(ref.scale?.[0] ?? 5).toFixed(1)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <Sep/>

          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5">
            <TB icon={<Undo2 size={17}/>} label="Deshacer (Ctrl+Z)" onClick={undo}/>
            <TB icon={<Redo2 size={17}/>} label="Rehacer (Ctrl+Y)"  onClick={redo}/>
          </div>
        </div>

        {/* ── Right group ── */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <div className="flex items-center bg-zinc-900 rounded p-0.5">
            <MB active={viewMode==='SOLID'}     onClick={() => setViewMode('SOLID')}     title="Sólido">
              <span className="px-1 text-[10px] font-medium">Sólido</span>
            </MB>
            <MB active={viewMode==='WIREFRAME'} onClick={() => setViewMode('WIREFRAME')} title="Malla">
              <span className="px-1 text-[10px] font-medium">Malla</span>
            </MB>
          </div>
          <div className="flex items-center gap-0.5">
            <TB icon={<Save size={17}/>}       label="Guardar"            onClick={handleSave}/>
            <TB icon={<FolderOpen size={17}/>} label="Abrir"              onClick={handleLoad}/>
            <TB icon={<Download size={17}/>}   label="Exportar STL"       onClick={handleExportSTL}/>
            <TB icon={<Code size={17}/>}       label="Copiar JSON"        onClick={handleCopyJSON}/>
            <TB icon={<Maximize2 size={17}/>}  label="Pantalla completa"  onClick={handleFullscreen}/>
          </div>
        </div>

        {/* ── Fixed Tooltip ── */}
        {tooltip && (
          <div 
            className="fixed z-[100] bg-zinc-800 text-zinc-200 text-[9px] px-2 py-1 rounded border border-zinc-700 shadow-xl pointer-events-none whitespace-nowrap"
            style={{
              top: tooltip.rect.bottom + 6,
              left: tooltip.rect.left + tooltip.rect.width / 2,
              transform: 'translateX(-50%)'
            }}
          >
            {tooltip.label}
          </div>
        )}
      </div>
    </TooltipContext.Provider>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────
const Sep = () => <div className="h-7 w-px bg-zinc-800 mx-1 flex-shrink-0"/>;

const TB: React.FC<{icon:React.ReactNode;label:string;onClick:()=>void;disabled?:boolean}> = ({icon,label,onClick,disabled}) => {
  const setTooltip = useContext(TooltipContext);
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={e => setTooltip?.(label, e.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => setTooltip?.(null)}
      className={'p-1.5 rounded transition-all group relative flex-shrink-0 '
        +(disabled ? 'text-zinc-700 cursor-not-allowed' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white')}>
      {icon}
    </button>
  );
};

const MB: React.FC<{active:boolean;onClick:()=>void;title:string;children:React.ReactNode}> = ({active,onClick,title,children}) => {
  const setTooltip = useContext(TooltipContext);
  return (
    <button onClick={onClick}
      onMouseEnter={e => setTooltip?.(title, e.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => setTooltip?.(null)}
      className={'p-1.5 rounded transition-colors '+(active ? 'bg-zinc-700 text-white shadow' : 'text-zinc-500 hover:text-zinc-300')}>
      {children}
    </button>
  );
};