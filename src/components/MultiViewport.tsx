import React from 'react';
import { Viewport } from './Viewport';
import { useStore } from '../store/useStore';

export const MultiViewport: React.FC = () => {
  const { maximizedViewport } = useStore();

  if (maximizedViewport) {
    let title = '';
    switch(maximizedViewport) {
      case 'PERSPECTIVE': title = 'Perspectiva'; break;
      case 'TOP': title = 'Superior (Planta)'; break;
      case 'BOTTOM': title = 'Inferior'; break;
      case 'FRONT': title = 'Frontal'; break;
      case 'BACK': title = 'Trasera'; break;
      case 'LEFT': title = 'Izquierda'; break;
      case 'RIGHT': title = 'Derecha'; break;
    }
    return (
      <div className="w-full h-full bg-zinc-950 p-px">
        <Viewport key={`max-${maximizedViewport}`} type={maximizedViewport} title={title} />
      </div>
    );
  }
  
  return (
    <div className="w-full h-full grid grid-cols-2 grid-rows-2 bg-zinc-950 gap-px p-px">
      <Viewport key="v-perspective" type="PERSPECTIVE" title="Perspectiva" />
      <Viewport key="v-top" type="TOP" title="Superior (Planta)" />
      <Viewport key="v-front" type="FRONT" title="Frontal" />
      <Viewport key="v-right" type="RIGHT" title="Derecha" />
    </div>
  );
};
