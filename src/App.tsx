import React, { useEffect, useState } from 'react';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { Timeline } from './components/Timeline';
import { MultiViewport } from './components/MultiViewport';
import { useStore } from './store/useStore';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

export default function App() {
  const { undo, redo, removeObject, selectedObjectId } = useStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Default closed on mobile

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
          e.preventDefault();
          undo();
        } else if (e.key === 'y') {
          e.preventDefault();
          redo();
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedObjectId && document.activeElement?.tagName !== 'INPUT') {
          removeObject(selectedObjectId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, removeObject, selectedObjectId]);

  return (
    <div className="flex flex-col h-screen w-screen bg-black overflow-hidden font-sans selection:bg-indigo-500/30">
      <Toolbar />
      
      <div className="flex-1 flex overflow-hidden relative">
        <MultiViewport />
        
        {/* Sidebar Toggle Button for Mobile/Small screens - Moved to bottom-right */}
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="fixed right-4 bottom-24 z-50 p-3 bg-indigo-600 shadow-2xl shadow-indigo-500/40 rounded-2xl text-white border border-indigo-400 lg:hidden active:scale-90 transition-transform"
          title="Alternar barra lateral"
        >
          {isSidebarOpen ? <PanelLeftClose size={24} /> : <PanelLeftOpen size={24} />}
        </button>

        {/* Removed backdrop to allow seeing viewport while sidebar is open */}

        <div className={`
          fixed inset-y-0 right-0 z-40 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0
          ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}
          w-52 sm:w-64 h-full shadow-2xl lg:shadow-none
        `}>
          <Sidebar />
        </div>
      </div>

      <div className="landscape:h-20 transition-all duration-300">
        <Timeline />
      </div>
    </div>
  );
}
