import React from 'react';
import { Viewport } from './Viewport';
import { useStore } from '../store/useStore';
import { ViewportType } from '../types';

const getTitle = (type: string) => {
  switch (type) {
    case 'PERSPECTIVE': return 'Perspectiva';
    case 'TOP': return 'Superior (Planta)';
    case 'BOTTOM': return 'Inferior';
    case 'FRONT': return 'Frontal';
    case 'BACK': return 'Trasera';
    case 'LEFT': return 'Izquierda';
    case 'RIGHT': return 'Derecha';
    case 'CAMERA': return 'Cámara';
    default: return type;
  }
};

const SLOTS: { id: string; defaultType: ViewportType; defaultTitle: string }[] = [
  { id: 'v-perspective', defaultType: 'PERSPECTIVE', defaultTitle: 'Perspectiva' },
  { id: 'v-top', defaultType: 'TOP', defaultTitle: 'Superior (Planta)' },
  { id: 'v-front', defaultType: 'FRONT', defaultTitle: 'Frontal' },
  { id: 'v-right', defaultType: 'RIGHT', defaultTitle: 'Derecha' },
];

export const MultiViewport: React.FC = () => {
  const { maximizedViewport, activeViewport } = useStore();

  let maximizedIndex = -1;
  if (maximizedViewport) {
    maximizedIndex = SLOTS.findIndex(s => s.defaultType === maximizedViewport);
    if (maximizedIndex === -1) {
      maximizedIndex = SLOTS.findIndex(s => s.defaultType === activeViewport);
      if (maximizedIndex === -1) maximizedIndex = 0;
    }
  }

  return (
    <div className={`w-full h-full bg-zinc-950 p-px ${maximizedViewport ? 'flex' : 'grid grid-cols-2 grid-rows-2 gap-px'}`}>
      {SLOTS.map((slot, index) => {
        const isMaximized = maximizedViewport !== null;
        const isThisMaximized = isMaximized && index === maximizedIndex;
        const isHidden = isMaximized && !isThisMaximized;

        const type = (isThisMaximized && slot.defaultType !== maximizedViewport)
          ? (maximizedViewport as ViewportType)
          : slot.defaultType;
        const title = getTitle(type);

        return (
          <div
            key={slot.id}
            className={`w-full h-full relative ${isHidden ? 'hidden' : 'block'}`}
          >
            <Viewport type={type} title={title} />
          </div>
        );
      })}
    </div>
  );
};

