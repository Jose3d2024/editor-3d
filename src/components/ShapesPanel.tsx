import React from 'react';
import { Box, Circle, Cylinder, Triangle, Hexagon, Type } from 'lucide-react';
import { PrimitiveType } from '../types';

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
  return (
    <div className="h-full bg-zinc-900 border-l border-zinc-800 flex flex-col">
      <div className="p-3 border-b border-zinc-800 bg-zinc-950">
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Formas Básicas</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          <ShapeItem type="CUBE" label="Cubo" color="#ef4444" icon={<Box size={24} />} />
          <ShapeItem type="CYLINDER" label="Cilindro" color="#f97316" icon={<Cylinder size={24} />} />
          <ShapeItem type="SPHERE" label="Esfera" color="#3b82f6" icon={<Circle size={24} />} />
          <ShapeItem type="CONE" label="Cono" color="#a855f7" icon={<Triangle size={24} />} />
          <ShapeItem type="TORUS" label="Toroide" color="#ec4899" icon={<Circle size={20} strokeWidth={4} />} />
          <ShapeItem type="PLANE" label="Plano" color="#10b981" icon={<Box size={24} className="scale-y-25" />} />
          <ShapeItem type="ICOSAHEDRON" label="Icosaedro" color="#06b6d4" icon={<Hexagon size={24} />} />
          <ShapeItem type="RING" label="Tubo" color="#8b5cf6" icon={<Circle size={24} strokeWidth={8} />} />
        </div>
      </div>
    </div>
  );
};
