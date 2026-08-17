import React, { useState } from 'react';
import { Box, Circle, Cylinder, Triangle, Hexagon, Spline, Waves, Orbit, Sparkles, Cone, Cloud, Wind, Flame, Zap } from 'lucide-react';
import { PrimitiveType, VolumetricConfig } from '../types';
import { useStore } from '../store/useStore';
import { VOLUMETRIC_PRESETS, DEFAULT_VOLUMETRIC_CONFIG } from '../utils/volumetricRaymarch';

interface ShapeItemProps {
  type: PrimitiveType;
  label: string;
  icon: React.ReactNode;
  color: string;
  desc?: string;
  customVolumetric?: VolumetricConfig;
}

const ShapeItem: React.FC<ShapeItemProps> = ({ type, label, icon, color, desc, customVolumetric }) => {
  const addObject = useStore(s => s.addObject);
  const updateObject = useStore(s => s.updateObject);
  const saveHistory = useStore(s => s.saveHistory);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('shapeType', type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleAdd = () => {
    addObject(type);
    if (customVolumetric) {
      setTimeout(() => {
        const selId = useStore.getState().selectedObjectId;
        if (selId) {
          updateObject(selId, {
            name: `${label} ${useStore.getState().project.objects.length}`,
            isVolumetric: true,
            volumetric: customVolumetric,
            color: customVolumetric.color || '#ffffff',
            parameters: {
              isVolumetric: true,
              volumetric: customVolumetric,
            }
          });
          saveHistory();
        }
      }, 20);
    }
  };

  return (
    <div 
      draggable 
      onDragStart={handleDragStart}
      onClick={handleAdd}
      className="flex flex-col items-center gap-1.5 p-2 cursor-pointer active:cursor-grabbing hover:bg-zinc-800/80 rounded-lg border border-transparent hover:border-zinc-700 transition-all group"
      title={`Añadir ${label} (o arrastra al visor 3D)`}
    >
      <div 
        className="w-11 h-11 rounded-lg shadow-sm flex items-center justify-center transition-transform group-hover:scale-105"
        style={{ backgroundColor: color }}
      >
        <div className="text-white/90 drop-shadow-md">
          {icon}
        </div>
      </div>
      <span className="text-[10px] text-zinc-300 font-medium text-center leading-tight">{label}</span>
      {desc && <span className="text-[8px] text-zinc-500 text-center leading-none">{desc}</span>}
    </div>
  );
};

export const ShapesPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'MESH' | 'NURBS' | 'VOLUME' | 'TEXTURES'>('MESH');
  const project = useStore(s => s.project);
  const setViewMode = useStore(s => s.setViewMode);
  const updateObject = useStore(s => s.updateObject);
  const saveHistory = useStore(s => s.saveHistory);

  const DEFAULT_TEXTURES = [
    'https://picsum.photos/seed/wood/512',
    'https://picsum.photos/seed/metal/512',
    'https://picsum.photos/seed/stone/512',
    'https://picsum.photos/seed/fabric/512',
    'https://picsum.photos/seed/concrete/512',
    'https://picsum.photos/seed/grass/512',
    'https://picsum.photos/seed/brick/512',
    'https://picsum.photos/seed/marble/512',
  ];

  return (
    <div className="h-full bg-zinc-900 border-l border-zinc-800 flex flex-col">
      {/* Category Tabs */}
      <div className="grid grid-cols-4 border-b border-zinc-800 bg-zinc-950">
        <button
          onClick={() => setActiveTab('MESH')}
          className={`py-2 text-[9px] font-bold tracking-wider uppercase transition-colors ${
            activeTab === 'MESH' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-zinc-900/60' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Mallas
        </button>
        <button
          onClick={() => setActiveTab('NURBS')}
          className={`py-2 text-[9px] font-bold tracking-wider uppercase transition-colors flex items-center justify-center gap-0.5 ${
            activeTab === 'NURBS' ? 'text-cyan-400 border-b-2 border-cyan-500 bg-zinc-900/60' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Waves size={10} />
          NURBS
        </button>
        <button
          onClick={() => setActiveTab('VOLUME')}
          className={`py-2 text-[9px] font-bold tracking-wider uppercase transition-colors flex items-center justify-center gap-0.5 ${
            activeTab === 'VOLUME' ? 'text-sky-400 border-b-2 border-sky-500 bg-zinc-900/60' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Cloud size={10} />
          Nubes 3D
        </button>
        <button
          onClick={() => setActiveTab('TEXTURES')}
          className={`py-2 text-[9px] font-bold tracking-wider uppercase transition-colors ${
            activeTab === 'TEXTURES' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-zinc-900/60' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Texturas
        </button>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        {activeTab === 'MESH' && (
          <div className="grid grid-cols-2 gap-2">
            <ShapeItem type="CUBE" label="Cubo" color="#ef4444" icon={<Box size={22} />} />
            <ShapeItem type="VOLUME_CLOUD" label="Nube 3D" color="#0284c7" desc="Raymarching" icon={<Cloud size={22} />} />
            <ShapeItem type="SPHERE" label="Esfera" color="#3b82f6" icon={<Circle size={22} />} />
            <ShapeItem type="CYLINDER" label="Cilindro" color="#f97316" icon={<Cylinder size={22} />} />
            <ShapeItem type="CONE" label="Cono" color="#a855f7" icon={<Triangle size={22} />} />
            <ShapeItem type="PYRAMID" label="Pirámide" color="#eab308" icon={<Triangle size={22} />} />
            <ShapeItem type="PRISM" label="Prisma" color="#10b981" icon={<Triangle size={22} className="rotate-90" />} />
            <ShapeItem type="CAPSULE" label="Cápsula" color="#14b8a6" icon={<Cylinder size={22} className="rounded-full" />} />
            <ShapeItem type="TORUS" label="Toroide" color="#ec4899" icon={<Circle size={18} strokeWidth={4} />} />
            <ShapeItem type="ICOSAHEDRON" label="Icosaedro" color="#06b6d4" icon={<Hexagon size={22} />} />
            <ShapeItem type="DODECAHEDRON" label="Dodecaedro" color="#6366f1" icon={<Hexagon size={22} className="rotate-45" />} />
            <ShapeItem type="TETRAHEDRON" label="Tetraedro" color="#f43f5e" icon={<Triangle size={22} />} />
            <ShapeItem type="OCTAHEDRON" label="Octaedro" color="#8b5cf6" icon={<Hexagon size={22} />} />
            <ShapeItem type="TUBE" label="Tubo 3D" color="#8b5cf6" icon={<Circle size={22} strokeWidth={8} />} />
            <ShapeItem type="ARC" label="Arco 3D" color="#14b8a6" icon={<Circle size={22} strokeWidth={6} />} />
            <ShapeItem type="STAR" label="Estrella 3D" color="#eab308" icon={<Hexagon size={22} />} />
            <ShapeItem type="WEDGE" label="Cuña" color="#64748b" icon={<Triangle size={22} className="rotate-180" />} />
            <ShapeItem type="HEMISPHERE" label="Hemisferio" color="#0284c7" icon={<Circle size={22} />} />
            <ShapeItem type="PLANE" label="Plano" color="#10b981" icon={<Box size={22} className="scale-y-25" />} />
            <ShapeItem type="RING" label="Anillo" color="#d946ef" icon={<Circle size={22} strokeWidth={4} />} />
          </div>
        )}

        {activeTab === 'NURBS' && (
          <div className="space-y-3">
            <div className="bg-cyan-950/30 border border-cyan-800/40 rounded-lg p-2.5">
              <span className="text-[11px] font-bold text-cyan-300 flex items-center gap-1.5 mb-1">
                <Sparkles size={13} />
                Primitivas NURBS
              </span>
              <p className="text-[9px] text-cyan-400/80 leading-relaxed">
                Geometría matemática B-Spline exacta con jaula de control (Hull) y pesos racionales.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <ShapeItem type="NURBS_CURVE" label="Curva NURBS" color="#06b6d4" desc="Spline B-Spline" icon={<Spline size={22} />} />
              <ShapeItem type="NURBS_CIRCLE" label="Círculo NURBS" color="#0ea5e9" desc="Racional Exacto" icon={<Orbit size={22} />} />
              <ShapeItem type="NURBS_SURFACE" label="Superficie Patch" color="#14b8a6" desc="Malla Cuadrática" icon={<Waves size={22} />} />
              <ShapeItem type="NURBS_CYLINDER" label="Cilindro NURBS" color="#0284c7" desc="Superficie Cilíndrica" icon={<Cylinder size={22} />} />
              <ShapeItem type="NURBS_CONE" label="Cono NURBS" color="#f59e0b" desc="Cono Racional" icon={<Cone size={22} />} />
              <ShapeItem type="NURBS_SPHERE" label="Esfera NURBS" color="#3b82f6" desc="Esfera Racional" icon={<Circle size={22} />} />
              <ShapeItem type="NURBS_TORUS" label="Toroide NURBS" color="#8b5cf6" desc="Toroide Continuo" icon={<Circle size={18} strokeWidth={4} />} />
            </div>
          </div>
        )}

        {activeTab === 'VOLUME' && (
          <div className="space-y-3">
            <div className="bg-sky-950/40 border border-sky-800/40 rounded-lg p-2.5">
              <span className="text-[11px] font-bold text-sky-300 flex items-center gap-1.5 mb-1">
                <Cloud size={13} />
                Raymarching Volumétrico 3D
              </span>
              <p className="text-[9px] text-sky-400/80 leading-relaxed">
                Nubes y gases continuos calculados dentro de un contenedor cúbico con ruido FBM 3D y absorción de luz interna (Beer-Lambert).
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <ShapeItem 
                type="VOLUME_CLOUD" 
                label="Nube Cúmulo" 
                color="#0284c7" 
                desc="Algodonosa Blanca"
                icon={<Cloud size={22} />}
                customVolumetric={VOLUMETRIC_PRESETS[0].config}
              />
              <ShapeItem 
                type="VOLUME_CLOUD" 
                label="Tormenta 3D" 
                color="#334155" 
                desc="Densa y Oscura"
                icon={<Zap size={22} />}
                customVolumetric={VOLUMETRIC_PRESETS[1].config}
              />
              <ShapeItem 
                type="VOLUME_CLOUD" 
                label="Humo Denso" 
                color="#475569" 
                desc="Humo Industrial"
                icon={<Wind size={22} />}
                customVolumetric={VOLUMETRIC_PRESETS[2].config}
              />
              <ShapeItem 
                type="VOLUME_CLOUD" 
                label="Nebulosa 3D" 
                color="#7c3aed" 
                desc="Gas Cósmico"
                icon={<Sparkles size={22} />}
                customVolumetric={VOLUMETRIC_PRESETS[3].config}
              />
              <ShapeItem 
                type="VOLUME_CLOUD" 
                label="Gas Ígneo" 
                color="#ea580c" 
                desc="Fuego Volumétrico"
                icon={<Flame size={22} />}
                customVolumetric={VOLUMETRIC_PRESETS[4].config}
              />
              <ShapeItem 
                type="VOLUME_CLOUD" 
                label="Aurora 3D" 
                color="#059669" 
                desc="Velo Esmeralda"
                icon={<Waves size={22} />}
                customVolumetric={VOLUMETRIC_PRESETS[5].config}
              />
            </div>
          </div>
        )}

        {activeTab === 'TEXTURES' && (
          <div className="grid grid-cols-2 gap-2">
            {DEFAULT_TEXTURES.map((url, i) => (
              <div 
                key={i}
                className="aspect-square bg-zinc-800 rounded border border-zinc-700 overflow-hidden cursor-pointer hover:border-indigo-500 transition-colors relative group"
                onClick={() => {
                  const selId = useStore.getState().selectedObjectId;
                  if (selId) {
                    const obj = project.objects.find(o => o.id === selId);
                    if (obj) {
                      const m = obj.material || {};
                      updateObject(selId, { material: { ...m, map: url } });
                      setViewMode('TEXTURED');
                      saveHistory();
                    }
                  }
                }}
              >
                <img src={url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-[8px] text-white font-bold uppercase">Aplicar</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

