import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Project } from '../types';
import {
  Save,
  FolderOpen,
  X,
  FileText,
  Clock,
  Trash2,
  Download,
  Check,
  HardDrive,
  Copy,
  AlertCircle
} from 'lucide-react';

export interface SavedSceneItem {
  id: string;
  name: string;
  savedAt: number;
  objectCount: number;
  lightCount: number;
  project: Project;
}

const LOCAL_STORAGE_KEY = 'csg_saved_scenes_library_v1';

export const getSavedScenes = (): SavedSceneItem[] => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

export const saveSceneToStorage = (project: Project): SavedSceneItem[] => {
  const existing = getSavedScenes();
  const now = Date.now();
  const sceneItem: SavedSceneItem = {
    id: project.name || 'Nuevo Proyecto',
    name: project.name || 'Nuevo Proyecto',
    savedAt: now,
    objectCount: project.objects.length,
    lightCount: project.lights.length,
    project: JSON.parse(JSON.stringify(project)),
  };

  const filtered = existing.filter(s => s.name !== sceneItem.name);
  const updated = [sceneItem, ...filtered];
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('LocalStorage save warning:', e);
  }
  return updated;
};

export const deleteSavedScene = (sceneName: string): SavedSceneItem[] => {
  const existing = getSavedScenes();
  const updated = existing.filter(s => s.name !== sceneName);
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('LocalStorage delete warning:', e);
  }
  return updated;
};

interface SaveProjectModalProps {
  isOpen: boolean;
  mode?: 'save' | 'save_as' | 'open';
  onClose: () => void;
  onSuccessNotification?: (message: string) => void;
}

export const SaveProjectModal: React.FC<SaveProjectModalProps> = ({
  isOpen,
  mode = 'save',
  onClose,
  onSuccessNotification,
}) => {
  const { project, setProject } = useStore();
  const [projectName, setProjectName] = useState(project.name || 'Nuevo Proyecto');
  const [downloadJsonToo, setDownloadJsonToo] = useState(false);
  const [savedScenes, setSavedScenes] = useState<SavedSceneItem[]>([]);
  const [activeTab, setActiveTab] = useState<'save' | 'library'>(mode === 'open' ? 'library' : 'save');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setProjectName(project.name || 'Nuevo Proyecto');
      setSavedScenes(getSavedScenes());
      setActiveTab(mode === 'open' ? 'library' : 'save');
      setFeedback(null);
    }
  }, [isOpen, project.name, mode]);

  if (!isOpen) return null;

  const handlePerformSave = (overwriteExisting = true) => {
    const finalName = projectName.trim() || 'Nuevo Proyecto';

    // Update project state name
    const updatedProject: Project = {
      ...project,
      name: finalName,
    };
    setProject(updatedProject);

    // Save to persistent localStorage library
    saveSceneToStorage(updatedProject);

    // If requested or as backup download JSON
    if (downloadJsonToo) {
      const blob = new Blob([JSON.stringify(updatedProject, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${finalName}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }

    const msg = `Proyecto "${finalName}" guardado y sobreescrito correctamente.`;
    if (onSuccessNotification) {
      onSuccessNotification(msg);
    }
    onClose();
  };

  const handleLoadScene = (scene: SavedSceneItem) => {
    try {
      setProject(scene.project);
      if (onSuccessNotification) {
        onSuccessNotification(`Escena "${scene.name}" cargada con éxito.`);
      }
      onClose();
    } catch (e) {
      setFeedback('Error al cargar la escena guardada.');
    }
  };

  const handleDelete = (sceneName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = deleteSavedScene(sceneName);
    setSavedScenes(updated);
    setFeedback(`Escena "${sceneName}" eliminada de la biblioteca.`);
  };

  const isOverwrite = savedScenes.some(s => s.name === projectName.trim());

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn select-none">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden text-zinc-100 p-6 space-y-4">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              {activeTab === 'save' ? <Save size={20} /> : <FolderOpen size={20} />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">
                {activeTab === 'save' ? (mode === 'save_as' ? 'Guardar Escena Como...' : 'Guardar Escena') : 'Biblioteca de Escenas'}
              </h3>
              <p className="text-[11px] text-zinc-400">
                {activeTab === 'save'
                  ? 'Guarda y sobreescribe tu escena en la memoria local o descárgala como archivo.'
                  : 'Carga proyectos guardados previamente en tu navegador.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('save')}
            className={`flex-1 py-1.5 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'save' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Save size={13} />
            <span>Guardar / Sobreescribir</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('library');
              setSavedScenes(getSavedScenes());
            }}
            className={`flex-1 py-1.5 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'library' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FolderOpen size={13} />
            <span>Mis Escenas ({savedScenes.length})</span>
          </button>
        </div>

        {/* Tab Content: Save */}
        {activeTab === 'save' && (
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
                <span>Nombre del Proyecto:</span>
                {isOverwrite && (
                  <span className="text-[10px] text-amber-400 font-mono bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-700/40">
                    ⚠️ Sobreescribirá la escena existente
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  placeholder="Nuevo Proyecto"
                  autoFocus
                  onFocus={e => e.target.select()}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handlePerformSave(true);
                    if (e.key === 'Escape') onClose();
                  }}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-medium focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-zinc-600"
                />
              </div>
            </div>

            {/* Scene details */}
            <div className="grid grid-cols-3 gap-2 p-2.5 bg-zinc-950/60 rounded-xl border border-zinc-800/80 text-[11px] text-zinc-400">
              <div>
                <span className="text-zinc-500 block">Objetos:</span>
                <span className="text-zinc-200 font-bold font-mono">{project.objects.length}</span>
              </div>
              <div>
                <span className="text-zinc-500 block">Luces:</span>
                <span className="text-zinc-200 font-bold font-mono">{project.lights.length}</span>
              </div>
              <div>
                <span className="text-zinc-500 block">Materiales:</span>
                <span className="text-zinc-200 font-bold font-mono">{project.materials.length}</span>
              </div>
            </div>

            {/* Options */}
            <div className="pt-1">
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={downloadJsonToo}
                  onChange={e => setDownloadJsonToo(e.target.checked)}
                  className="rounded border-zinc-700 text-indigo-500 focus:ring-0 bg-zinc-800 cursor-pointer"
                />
                <Download size={13} className="text-indigo-400" />
                <span>Descargar también archivo .json al equipo</span>
              </label>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handlePerformSave(true)}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Save size={14} />
                <span>{isOverwrite ? 'Sobreescribir y Guardar' : 'Guardar Proyecto'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab Content: Library */}
        {activeTab === 'library' && (
          <div className="space-y-3 pt-1">
            {feedback && (
              <div className="p-2 bg-indigo-950/60 border border-indigo-700/50 rounded-lg text-indigo-300 text-xs flex items-center gap-2">
                <AlertCircle size={14} />
                <span>{feedback}</span>
              </div>
            )}

            {savedScenes.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-xs space-y-2">
                <HardDrive size={32} className="mx-auto text-zinc-600 opacity-50" />
                <p>No tienes escenas guardadas localmente todavía.</p>
                <p className="text-[11px] text-zinc-600">Usa la pestaña "Guardar" para guardar tu primera escena.</p>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {savedScenes.map(scene => (
                  <div
                    key={scene.name}
                    onClick={() => handleLoadScene(scene)}
                    className="p-3 bg-zinc-950 hover:bg-indigo-950/30 border border-zinc-800 hover:border-indigo-600/40 rounded-xl flex items-center justify-between cursor-pointer transition-all group"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-indigo-400" />
                        <span className="font-semibold text-xs text-white group-hover:text-indigo-200">
                          {scene.name}
                        </span>
                        {scene.name === project.name && (
                          <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-indigo-900/60 text-indigo-300 border border-indigo-700/40 font-mono">
                            Actual
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {new Date(scene.savedAt).toLocaleString()}
                        </span>
                        <span>• {scene.objectCount} objetos</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={(e) => handleDelete(scene.name, e)}
                        title="Eliminar escena"
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                      <button
                        type="button"
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold transition-all shadow-xs"
                      >
                        Abrir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
