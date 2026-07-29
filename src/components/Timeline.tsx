import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../store/useStore';
import {
  Play, Pause, Square, SkipBack, Clock, Circle, Plus, Trash2,
  ChevronDown, ChevronRight, Key, Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Constantes de layout ───────────────────────────────────────────────────
const ROW_H        = 28;   // px por fila de objeto
const HEADER_H     = 44;   // px cabecera de controles
const LABEL_W      = 140;  // px columna de nombres
const MIN_TRACK_H  = 60;   // altura mínima del área de tracks (sin objetos)
const MAX_ROWS     = 5;    // filas visibles antes de scroll

// ── Colores por operación ──────────────────────────────────────────────────
const OP_COLOR: Record<string, string> = {
  ADD:       '#6366f1',
  SUBTRACT:  '#ef4444',
  INTERSECT: '#f59e0b',
};

interface TimelineProps {
  onToggleCollapse?: () => void;
}

export const Timeline: React.FC<TimelineProps> = ({ onToggleCollapse }) => {
  const {
    project, currentTime, setCurrentTime,
    isPlaying, setIsPlaying,
    isRecording, setIsRecording,
    selectedObjectId, selectedObjectIds,
    addKeyframe, removeKeyframe, clearAllKeyframes,
    selectObject,
  } = useStore();

  const { objects, duration } = project;

  // ── Animación ──────────────────────────────────────────────────────────
  const rafRef      = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  const tick = useCallback((now: number) => {
    if (lastTimeRef.current !== 0) {
      const dt = (now - lastTimeRef.current) / 1000;
      const s  = useStore.getState();
      if (s.isPlaying) {
        const next = s.currentTime + dt;
        s.setCurrentTime(next >= s.project.duration ? 0 : next);
      }
    }
    lastTimeRef.current = now;
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [tick]);

  // ── Estado de track ────────────────────────────────────────────────────
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const trackRef = useRef<HTMLDivElement>(null);

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Objetos con keyframes — los que tienen o todos si grabando
  const objectsWithKf = objects.filter(o => (o.keyframes && o.keyframes.length > 0));
  const trackObjects  = objectsWithKf.length > 0 ? objectsWithKf : objects.slice(0, 1);
  const visibleCount  = Math.min(trackObjects.length, MAX_ROWS);
  const trackAreaH    = Math.max(MIN_TRACK_H, visibleCount * ROW_H + 4);

  // ── Clic en el track para mover playhead ──────────────────────────────
  const handleTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x    = e.clientX - rect.left - LABEL_W;
    const w    = rect.width - LABEL_W;
    if (w <= 0) return;
    const t = Math.max(0, Math.min(duration, (x / w) * duration));
    setCurrentTime(t);
  }, [duration, setCurrentTime]);

  // ── Keyframe click ─────────────────────────────────────────────────────
  const handleKfClick = (e: React.MouseEvent, objId: string, kfId: string, time: number) => {
    e.stopPropagation();
    selectObject(objId);
    setCurrentTime(time);
  };

  const handleKfDelete = (e: React.MouseEvent, objId: string, kfId: string) => {
    e.stopPropagation();
    removeKeyframe(objId, kfId);
  };

  const fmt = (t: number) => t.toFixed(2);

  // ── Tick labels ────────────────────────────────────────────────────────
  const tickCount = Math.min(Math.floor(duration) + 1, 11);
  const tickTimes = Array.from({ length: tickCount }, (_, i) =>
    duration <= 10 ? i : Math.round((i / (tickCount - 1)) * duration)
  );

  return (
    <div
      className="flex flex-col select-none text-zinc-300 bg-zinc-950/80 backdrop-blur-xl border-t border-white/5 relative overflow-hidden"
    >
      {/* ══════════════ CONTROLES DE TRANSPORTE ══════════════ */}
      <div
        className="flex items-center justify-between px-4 flex-shrink-0 border-b border-white/5"
        style={{ height: HEADER_H }}
      >
        {/* Izquierda: transporte */}
        <div className="flex items-center gap-2">
          {/* Ir al inicio */}
          <button
            onClick={() => setCurrentTime(0)}
            className="p-1.5 rounded-lg transition-all text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
            title="Inicio (Home)"
          >
            <SkipBack size={14} />
          </button>

          {/* Play/Pause */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`w-8 h-8 flex items-center justify-center rounded-full transition-all flex-shrink-0 shadow-lg ${
              isPlaying 
                ? 'bg-indigo-600 text-white shadow-indigo-500/20 scale-105' 
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
            }`}
            title={isPlaying ? 'Pausar (Space)' : 'Reproducir (Space)'}
          >
            {isPlaying
              ? <Pause size={14} fill="currentColor" />
              : <Play  size={14} fill="currentColor" className="ml-0.5" />
            }
          </button>

          {/* Stop */}
          <button
            onClick={() => { setIsPlaying(false); setCurrentTime(0); }}
            className="p-1.5 rounded-lg transition-all text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
            title="Detener"
          >
            <Square size={13} fill="currentColor" />
          </button>

          <div className="w-px h-4 bg-white/5 mx-1" />

          {/* Auto-Key */}
          <button
            onClick={() => setIsRecording(!isRecording)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
              isRecording
                ? 'bg-rose-600 text-white border-rose-400 shadow-lg shadow-rose-500/20'
                : 'bg-zinc-800/50 text-zinc-500 border-white/5 hover:bg-zinc-700 hover:text-zinc-300'
            }`}
            title={isRecording ? 'Detener Auto-Key' : 'Auto-Key: graba keyframe al mover'}
          >
            <Circle size={10} fill={isRecording ? 'currentColor' : 'none'} />
            <span className="hidden sm:inline">REC</span>
          </button>

          <div className="w-px h-4 bg-white/5 mx-1" />

          {/* Añadir keyframe */}
          <button
            onClick={() => selectedObjectId && addKeyframe(selectedObjectId, currentTime)}
            disabled={!selectedObjectId}
            className="p-2 rounded-lg transition-all text-zinc-500 hover:text-indigo-400 hover:bg-indigo-500/10 disabled:opacity-20"
            title={selectedObjectId ? `Keyframe en ${fmt(currentTime)}s` : 'Selecciona un objeto primero'}
          >
            <Key size={14} />
          </button>

          {/* Eliminar todos los keyframes del objeto */}
          <button
            onClick={() => selectedObjectId && clearAllKeyframes(selectedObjectId)}
            disabled={!selectedObjectId}
            className="p-2 rounded-lg transition-all text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-20"
            title="Borrar todos los keyframes del objeto"
          >
            <Trash2 size={14} />
          </button>
        </div>

        {/* Centro: tiempo */}
        <div className="flex items-center gap-3 font-mono text-[11px] absolute left-1/2 -translate-x-1/2 bg-zinc-900/50 px-4 py-1.5 rounded-full border border-white/5 shadow-inner">
          <Clock size={12} className="text-zinc-600" />
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-100 font-bold">{fmt(currentTime)}</span>
            <span className="text-zinc-700">/</span>
            <span className="text-zinc-500">{duration}s</span>
          </div>
        </div>

        {/* Derecha: label y botón de minimizar */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase font-bold tracking-[0.2em] text-zinc-500 hidden lg:block">
            Línea de Tiempo
          </span>
          <div className="w-7 h-7 rounded-lg bg-white/[0.03] border border-white/5 flex items-center justify-center text-zinc-400">
            <Layers size={13} />
          </div>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all border border-white/10 shadow-sm active:scale-95"
              title="Minimizar línea de tiempo para ocultarla y aumentar la visibilidad de los visores (T)"
            >
              <span className="text-[10px] font-bold">Minimizar</span>
              <ChevronDown size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ══════════════ ÁREA DE TRACKS ══════════════ */}
      <div
        className="flex flex-col overflow-hidden"
        style={{ height: trackAreaH + 24 }}
      >
        {/* Ruler de tiempo + track clickeable */}
        <div className="flex flex-shrink-0 bg-zinc-950/40" style={{ height: 18 }}>
          {/* Spacer del label */}
          <div className="flex-shrink-0 border-r border-white/5" style={{ width: LABEL_W }} />
          {/* Ruler */}
          <div
            className="relative flex-1 cursor-pointer"
            onClick={handleTrackClick}
          >
            {tickTimes.map((t, i) => (
              <div
                key={i}
                className="absolute top-0 flex flex-col items-center pointer-events-none"
                style={{ left: `${duration > 0 ? (t / duration) * 100 : 0}%`, transform: 'translateX(-50%)' }}
              >
                <div className="w-px h-2 bg-white/10" />
                <span className="text-[8px] font-mono text-zinc-600 mt-0.5">{t}s</span>
              </div>
            ))}
            {/* Playhead en ruler */}
            <div
              className="absolute top-0 bottom-0 w-px pointer-events-none z-10 bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]"
              style={{ left: `${pct}%` }}
            />
          </div>
        </div>

        {/* Filas de objetos */}
        <div
          ref={trackRef}
          className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar"
        >
          {trackObjects.length === 0 ? (
            /* Empty state */
            <div className="flex items-center justify-center h-full gap-3 text-zinc-600">
              <Layers size={16} className="opacity-20" />
              <span className="text-[11px] font-medium italic">Mueve objetos en modo Record o añade keyframes manualmente</span>
            </div>
          ) : (
            trackObjects.map((obj) => {
              const isSelected  = obj.id === selectedObjectId || (selectedObjectIds || []).includes(obj.id);
              const keyframes   = obj.keyframes || [];
              const opColor     = OP_COLOR[obj.operation] || '#6366f1';

              return (
                <div
                  key={obj.id}
                  className="flex flex-shrink-0 group/row"
                  style={{ height: ROW_H, borderBottom: '1px solid rgba(255,255,255,0.02)' }}
                >
                  {/* ── Label ── */}
                  <div
                    className={`flex items-center gap-2.5 px-3 flex-shrink-0 cursor-pointer transition-all border-r border-white/5 ${
                      isSelected ? 'bg-indigo-500/10' : 'hover:bg-white/[0.02]'
                    }`}
                    style={{ width: LABEL_W }}
                    onClick={() => selectObject(obj.id)}
                  >
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0 shadow-sm"
                      style={{ background: opColor, boxShadow: isSelected ? `0 0 8px ${opColor}44` : 'none' }}
                    />
                    <span
                      className={`text-[10px] truncate flex-1 transition-colors ${
                        isSelected ? 'text-zinc-100 font-bold' : 'text-zinc-500 group-hover/row:text-zinc-300'
                      }`}
                    >
                      {obj.name}
                    </span>
                    {keyframes.length > 0 && (
                      <span
                        className={`text-[8px] font-bold flex-shrink-0 px-1.5 py-0.5 rounded-full ${
                          isSelected ? 'bg-indigo-500/20 text-indigo-300' : 'bg-white/5 text-zinc-600'
                        }`}
                      >
                        {keyframes.length}
                      </span>
                    )}
                  </div>

                  {/* ── Track lane ── */}
                  <div
                    className={`relative flex-1 cursor-pointer transition-colors ${
                      isSelected ? 'bg-indigo-500/[0.02]' : 'bg-transparent'
                    }`}
                    onClick={handleTrackClick}
                  >
                    {/* Barra de rango (primer KF → último KF) */}
                    {keyframes.length >= 2 && (() => {
                      const first = Math.min(...keyframes.map(k => k.time));
                      const last  = Math.max(...keyframes.map(k => k.time));
                      const l = (first / duration) * 100;
                      const w = ((last - first) / duration) * 100;
                      return (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 rounded-full pointer-events-none opacity-40 shadow-inner"
                          style={{
                            left: `${l}%`,
                            width: `${w}%`,
                            height: 4,
                            background: isSelected ? opColor : 'rgba(255,255,255,0.05)',
                          }}
                        />
                      );
                    })()}

                    {/* Diamantes de keyframe */}
                    {keyframes.map((kf) => {
                      const kfPct = duration > 0 ? (kf.time / duration) * 100 : 0;
                      const isAtCurrent = Math.abs(kf.time - currentTime) < 0.02;

                      return (
                        <motion.button
                          key={kf.id}
                          whileHover={{ scale: 1.2 }}
                          className="absolute top-1/2 z-20"
                          style={{
                            left: `${kfPct}%`,
                            transform: 'translate(-50%, -50%) rotate(45deg)',
                            width:  isSelected ? 10 : 8,
                            height: isSelected ? 10 : 8,
                            borderRadius: 2,
                            background: isAtCurrent ? '#fff' : (isSelected ? opColor : '#3f3f46'),
                            border: `2px solid ${isAtCurrent ? '#6366f1' : 'transparent'}`,
                            boxShadow: isAtCurrent 
                              ? '0 0 12px rgba(99,102,241,0.8)' 
                              : (isSelected ? `0 0 8px ${opColor}44` : 'none'),
                          }}
                          title={`${obj.name} @ ${kf.time.toFixed(3)}s — clic: ir · shift+clic: borrar`}
                          onClick={(e) => {
                            if (e.shiftKey) { handleKfDelete(e, obj.id, kf.id); }
                            else { handleKfClick(e, obj.id, kf.id, kf.time); }
                          }}
                        />
                      );
                    })}

                    {/* Playhead */}
                    <div
                      className="absolute top-0 bottom-0 w-px pointer-events-none z-30 bg-indigo-500/30"
                      style={{ left: `${pct}%` }}
                    />

                    {/* Input invisible para scrubbing */}
                    <input
                      type="range"
                      min={0} max={duration} step={0.001}
                      value={currentTime}
                      onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-40"
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Hint ── */}
      <div
        className="flex items-center justify-between px-4 py-1.5 flex-shrink-0 border-t border-white/5 bg-zinc-950/40"
      >
        <span className="text-[9px] font-medium text-zinc-600 italic">
          Clic en diamante para ir · Shift+clic para borrar · Record activa auto-key al mover
        </span>
        {isRecording && (
          <motion.span 
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="text-[9px] font-bold text-rose-400 tracking-widest uppercase"
          >
            ● Grabando Movimiento
          </motion.span>
        )}
      </div>
    </div>
  );
};
