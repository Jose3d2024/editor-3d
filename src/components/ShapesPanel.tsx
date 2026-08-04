import React from 'react';
import { Box, Circle, Cylinder, Triangle, Hexagon } from 'lucide-react';
import { PrimitiveType } from '../types';
import { useStore } from '../store/useStore';

interface ShapeItemProps {
  type: PrimitiveType;
  label: string;
  icon: React.ReactNode;
  color: string;
}

const ShapeItem: React.FC<ShapeItemProps> = ({ type, label, icon, color }) => {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('shapeType', type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div 
      draggable 
      onDragStart={handleDragStart}
      className="flex flex-col items-center gap-2 p-2 cursor-grab active:cursor-grabbing hover:bg-zinc-100/5 rounded-lg transition-colors group"
    >
      <div 
        className="w-12 h-12 rounded-lg shadow-sm flex items-center justify-center transition-transform group-hover:scale-105"
        style={{ backgroundColor: color }}
      >
        <div className="text-white/90 drop-shadow-md">
          {icon}
        </div>
      </div>
      <span className="text-[10px] text-zinc-400 font-medium">{label}</span>
    </div>
  );
};

export const ShapesPanel: React.FC = () => {
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
      <div className="p-3 border-b border-zinc-800 bg-zinc-950">
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Formas Básicas</span>
      </div>
      
      <div className="p-3 max-h-60 overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-2 gap-2">
          <ShapeItem type="CUBE" label="Cubo" color="#ef4444" icon={<Box size={24} />} />
          <ShapeItem type="SPHERE" label="Esfera" color="#3b82f6" icon={<Circle size={24} />} />
          <ShapeItem type="CYLINDER" label="Cilindro" color="#f97316" icon={<Cylinder size={24} />} />
          <ShapeItem type="CONE" label="Cono" color="#a855f7" icon={<Triangle size={24} />} />
          <ShapeItem type="PYRAMID" label="Pirámide" color="#eab308" icon={<Triangle size={24} />} />
          <ShapeItem type="PRISM" label="Prisma" color="#10b981" icon={<Triangle size={24} className="rotate-90" />} />
          <ShapeItem type="CAPSULE" label="Cápsula" color="#14b8a6" icon={<Cylinder size={24} className="rounded-full" />} />
          <ShapeItem type="TORUS" label="Toroide" color="#ec4899" icon={<Circle size={20} strokeWidth={4} />} />
          <ShapeItem type="ICOSAHEDRON" label="Icosaedro" color="#06b6d4" icon={<Hexagon size={24} />} />
          <ShapeItem type="DODECAHEDRON" label="Dodecaedro" color="#6366f1" icon={<Hexagon size={24} className="rotate-45" />} />
          <ShapeItem type="TETRAHEDRON" label="Tetraedro" color="#f43f5e" icon={<Triangle size={24} />} />
          <ShapeItem type="OCTAHEDRON" label="Octaedro" color="#8b5cf6" icon={<Hexagon size={24} />} />
          <ShapeItem type="TUBE" label="Tubo 3D" color="#8b5cf6" icon={<Circle size={24} strokeWidth={8} />} />
          <ShapeItem type="ARC" label="Arco 3D" color="#14b8a6" icon={<Circle size={24} strokeWidth={6} />} />
          <ShapeItem type="STAR" label="Estrella 3D" color="#eab308" icon={<Hexagon size={24} />} />
          <ShapeItem type="WEDGE" label="Cuña" color="#64748b" icon={<Triangle size={24} className="rotate-180" />} />
          <ShapeItem type="HEMISPHERE" label="Hemisferio" color="#0284c7" icon={<Circle size={24} className="clip-half" />} />
          <ShapeItem type="PLANE" label="Plano" color="#10b981" icon={<Box size={24} className="scale-y-25" />} />
          <ShapeItem type="RING" label="Anillo" color="#d946ef" icon={<Circle size={24} strokeWidth={4} />} />
        </div>
      </div>

      <div className="p-3 border-y border-zinc-800 bg-zinc-950">
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Texturas</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
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
      </div>
    </div>
  );
};
