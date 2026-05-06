import React, { useState } from 'react';
import { Toolbar } from './components/Toolbar';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Timeline } from './components/Timeline';
import { MultiViewport } from './components/MultiViewport';
import { PanelRightClose, PanelRightOpen, ChevronDown, ChevronUp } from 'lucide-react';

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isTimelineCollapsed, setIsTimelineCollapsed] = useState(false);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden font-sans"
         style={{ background: 'var(--surface-0)' }}>

      {/* ── Top bar ── */}
      <Toolbar />

      {/* ── Main area ── */}
      <div className="flex-1 flex overflow-hidden relative"
           style={{ borderTop: '1px solid var(--border)' }}>

        {/* Viewport */}
        <div className="flex-1 relative overflow-hidden flex flex-col min-w-0">
          <MultiViewport />
          
          {/* Timeline Toggle Button */}
          <button
            onClick={() => setIsTimelineCollapsed(v => !v)}
            className="absolute bottom-4 right-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-lg transition-colors hover:bg-white/5"
            style={{ background: 'var(--surface-1)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            title={isTimelineCollapsed ? "Expandir línea de tiempo" : "Minimizar línea de tiempo"}
          >
            <span className="text-[10px] font-bold uppercase tracking-widest">Línea de tiempo</span>
            {isTimelineCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* Sidebar separator (desktop) */}
        <div className="hidden lg:block w-px flex-shrink-0"
             style={{ background: 'var(--border)' }} />

        {/* Sidebar panel */}
        <aside
          className={[
            'fixed inset-y-0 right-0 z-40',
            'transform transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
            'lg:relative lg:translate-x-0 lg:inset-auto',
            isSidebarOpen ? 'translate-x-0' : 'translate-x-full',
            'w-80 sm:w-[340px] lg:w-[340px] xl:w-[360px]',
            'flex flex-col overflow-hidden',
          ].join(' ')}
          style={{ background: 'var(--surface-1)' }}
        >
          {/* Mobile header */}
          <div className="flex items-center justify-between px-3 py-2 border-b lg:hidden"
               style={{ borderColor: 'var(--border)' }}>
            <span className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: 'var(--text-muted)' }}>Propiedades</span>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
            >
              <PanelRightClose size={14} style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            <PropertiesPanel />
          </div>
        </aside>

        {/* Mobile FAB */}
        <button
          onClick={() => setIsSidebarOpen(v => !v)}
          className="fixed right-4 bottom-28 z-50 p-3 rounded-2xl lg:hidden transition-all duration-200 active:scale-90 shadow-2xl"
          style={{
            background: isSidebarOpen ? 'var(--surface-3)' : 'var(--accent)',
            boxShadow: isSidebarOpen
              ? '0 8px 32px rgba(0,0,0,0.4)'
              : '0 8px 32px rgba(99,102,241,0.45)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
          title="Alternar panel de propiedades"
        >
          {isSidebarOpen
            ? <PanelRightClose size={20} className="text-white" />
            : <PanelRightOpen  size={20} className="text-white" />
          }
        </button>

        {/* Mobile overlay */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-30 lg:hidden"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
      </div>

      {/* ── Timeline ── */}
      {!isTimelineCollapsed && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <Timeline />
        </div>
      )}
    </div>
  );
}
