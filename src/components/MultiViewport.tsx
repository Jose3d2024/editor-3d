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
      case 'FRONT': title = 'Frontal'; break;
      case 'SIDE': title = 'Lateral'; break;
    }
    return (
      <div className="flex-1 w-full h-full bg-zinc-950 p-px">
        <Viewport key={`max-${maximizedViewport}`} type={maximizedViewport} title={title} />
      </div>
    );
  }
  
  return (
    <div className="flex-1 grid grid-cols-2 grid-rows-2 bg-zinc-950 gap-px p-px">
      <Viewport key="v-perspective" type="PERSPECTIVE" title="Perspectiva" />
      <Viewport key="v-top" type="TOP" title="Superior (Planta)" />
      <Viewport key="v-front" type="FRONT" title="Frontal" />
      <Viewport key="v-side" type="SIDE" title="Lateral" />
    </div>
  );
};
