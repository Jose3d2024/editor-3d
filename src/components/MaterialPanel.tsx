import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { MaterialData } from '../types';
import { MaterialThumbnail } from './MaterialThumbnail';
import { 
  Settings, 
  Palette, 
  Layers, 
  Droplets, 
  Sun, 
  Eye, 
  Trash2, 
  Plus, 
  Upload,
  Box,
  Zap,
  ArrowLeft,
  Download,
  FileUp,
  FolderOpen,
  AlertTriangle,
  CheckCircle,
  X,
  Search,
  Sparkles
} from 'lucide-react';
import { createORMMap } from '../utils/materialUtils';
import { importPBRPack, detectSlotFromFilename, importTextureFile } from '../utils/materialImporter';
import { 
  MATERIAL_LIBRARY, 
  MATERIAL_CATEGORIES, 
  generateMaterial, 
  generateAllThumbnails, 
  ProceduralMaterial 
} from '../utils/proceduralTextures';

// ── Modal de importación de pack PBR ────────────────────────────────────────
const PBRImportModal: React.FC<{
  onClose: () => void;
  onImport: (mat: Omit<MaterialData, 'id'>) => void;
}> = ({ onClose, onImport }) => {
  const [step, setStep]           = useState<'select' | 'preview' | 'importing'>('select');
  const [files, setFiles]         = useState<File[]>([]);
  const [result, setResult]       = useState<Awaited<ReturnType<typeof importPBRPack>> | null>(null);
  const [matName, setMatName]     = useState('');
  const [error, setError]         = useState('');

  const SLOT_LABELS: Record<string, string> = {
    map:             'Albedo / Color',
    normalMap:       'Normal Map',
    roughnessMap:    'Roughness',
    metalnessMap:    'Metalness',
    aoMap:           'AO',
    emissiveMap:     'Emisivo',
    displacementMap: 'Displacement / Height',
    alphaMap:        'Alpha / Opacidad',
  };

  const handleFiles = (selectedFiles: FileList | File[]) => {
    const arr = Array.from(selectedFiles);
    setFiles(arr);
  };

  const handleAnalyze = async () => {
    if (files.length === 0) { setError('Selecciona al menos un archivo.'); return; }
    setError('');
    setStep('importing');
    try {
      const res = await importPBRPack(files);
      setResult(res);
      setMatName((res.material.name as string) || 'Material PBR');
      setStep('preview');
    } catch (e) {
      setError('Error al procesar los archivos: ' + (e as Error).message);
      setStep('select');
    }
  };

  const handleConfirm = () => {
    if (!result) return;
    const mat = {
      ...result.material,
      name: matName || 'Material PBR',
      color:             (result.material.color as string) || '#ffffff',
      roughness:         (result.material.roughness as number) ?? 0.5,
      metalness:         (result.material.metalness as number) ?? 0,
      emissive:          (result.material.emissive as string) || '#000000',
      emissiveIntensity: (result.material.emissiveIntensity as number) ?? 1,
      opacity:           (result.material.opacity as number) ?? 1,
      transparent:       (result.material.transparent as boolean) ?? false,
      ior:               (result.material.ior as number) ?? 1.5,
      transmission:      (result.material.transmission as number) ?? 0,
      thickness:         (result.material.thickness as number) ?? 0,
    } as Omit<MaterialData, 'id'>;
    onImport(mat);
    onClose();
  };

  const formatExt = (name: string) => name.split('.').pop()?.toUpperCase() || '';
  const formatColor = (ext: string) => {
    const map: Record<string, string> = {
      MTLX: 'bg-purple-900/40 text-purple-300', TRES: 'bg-teal-900/40 text-teal-300',
      USDA: 'bg-blue-900/40 text-blue-300',   PNG: 'bg-green-900/40 text-green-300',
      JPG: 'bg-green-900/40 text-green-300',  JPEG: 'bg-green-900/40 text-green-300',
      WEBP: 'bg-green-900/40 text-green-300',
    };
    return map[ext] || 'bg-zinc-800 text-zinc-400';
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-[#18181b] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 flex items-center justify-center">
              <FolderOpen size={16} className="text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Importar Pack PBR</h2>
              <p className="text-[10px] text-zinc-500">PNG/JPG · .mtlx · .tres · .usda</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">

          {step === 'select' && (
            <>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Selecciona <span className="text-white font-semibold">todos los archivos del pack</span> a la vez: el archivo de formato
                (<code className="text-indigo-300">.mtlx</code>, <code className="text-indigo-300">.tres</code> o <code className="text-indigo-300">.usda</code>)
                junto con las texturas PNG. Los slots se detectan automáticamente por el nombre.
              </p>

              {/* Drop zone */}
              <label
                className="flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed border-zinc-700 hover:border-indigo-500 transition-colors cursor-pointer bg-zinc-900/40 hover:bg-indigo-500/5"
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-indigo-400'); }}
                onDragLeave={e => e.currentTarget.classList.remove('border-indigo-400')}
                onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('border-indigo-400'); handleFiles(e.dataTransfer.files); }}
              >
                <FolderOpen size={32} className="text-zinc-600" />
                <span className="text-[11px] text-zinc-500 text-center">
                  Arrastra aquí los archivos del pack<br />o haz clic para seleccionarlos
                </span>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  accept=".png,.jpg,.jpeg,.webp,.tga,.tiff,.mtlx,.tres,.usda,.usdc,.blend"
                  onChange={e => e.target.files && handleFiles(e.target.files)}
                />
              </label>

              {files.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">{files.length} archivos seleccionados</p>
                  <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-[10px]">
                        <span className={`px-1.5 py-0.5 rounded font-bold text-[9px] ${formatColor(formatExt(f.name))}`}>
                          {formatExt(f.name)}
                        </span>
                        <span className="text-zinc-400 truncate">{f.name}</span>
                        <span className="text-zinc-600 ml-auto flex-shrink-0">{(f.size / 1024).toFixed(0)}KB</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Formatos soportados */}
              <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-1.5">
                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-2">Formatos soportados</p>
                {[
                  { fmt: '.mtlx', desc: 'MaterialX — estándar Academy Software Foundation', ok: true },
                  { fmt: '.tres', desc: 'Godot Engine 4 StandardMaterial3D', ok: true },
                  { fmt: '.usda', desc: 'USD ASCII (Universal Scene Description)', ok: true },
                  { fmt: '.usdc', desc: 'USD binario → necesita conversión a .usda', ok: false },
                  { fmt: '.blend', desc: 'Blender nativo → exportar como GLB desde Blender', ok: false },
                ].map(({ fmt, desc, ok }) => (
                  <div key={fmt} className="flex items-center gap-2">
                    {ok
                      ? <CheckCircle size={11} className="text-teal-400 flex-shrink-0" />
                      : <AlertTriangle size={11} className="text-amber-400 flex-shrink-0" />
                    }
                    <code className="text-[10px] text-indigo-300 w-12 flex-shrink-0">{fmt}</code>
                    <span className="text-[10px] text-zinc-500">{desc}</span>
                  </div>
                ))}
              </div>

              {error && <p className="text-[11px] text-red-400 bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}

              <button
                onClick={handleAnalyze}
                disabled={files.length === 0}
                className={`w-full py-2.5 rounded-xl text-[12px] font-bold transition-all ${files.length > 0 ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'}`}
              >
                Analizar archivos →
              </button>
            </>
          )}

          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-zinc-400">Procesando pack PBR...</p>
            </div>
          )}

          {step === 'preview' && result && (
            <>
              {/* Nombre */}
              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Nombre del material</label>
                <input
                  value={matName}
                  onChange={e => setMatName(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Slots detectados */}
              <div className="space-y-2">
                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Texturas detectadas</p>
                {Object.keys(SLOT_LABELS).map(slot => {
                  const hasMap = !!(result.material as any)[slot];
                  return (
                    <div key={slot} className={`flex items-center gap-3 p-2 rounded-lg ${hasMap ? 'bg-teal-900/15 border border-teal-900/30' : 'bg-zinc-900/40 border border-zinc-800'}`}>
                      {hasMap
                        ? <CheckCircle size={12} className="text-teal-400 flex-shrink-0" />
                        : <div className="w-3 h-3 rounded-full border border-zinc-700 flex-shrink-0" />
                      }
                      <span className="text-[11px] text-zinc-300 flex-1">{SLOT_LABELS[slot]}</span>
                      {hasMap
                        ? <span className="text-[9px] text-teal-400 font-bold">Asignado</span>
                        : <span className="text-[9px] text-zinc-600">Sin asignar</span>
                      }
                    </div>
                  );
                })}
              </div>

              {/* Valores escalares detectados */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Color base', value: result.material.color, type: 'color' },
                  { label: 'Rugosidad', value: ((result.material.roughness as number) ?? 0.5).toFixed(2), type: 'text' },
                  { label: 'Metalicidad', value: ((result.material.metalness as number) ?? 0).toFixed(2), type: 'text' },
                  { label: 'IOR', value: ((result.material.ior as number) ?? 1.5).toFixed(2), type: 'text' },
                ].map(({ label, value, type }) => (
                  <div key={label} className="bg-zinc-900/60 rounded-lg px-3 py-2">
                    <p className="text-[9px] text-zinc-600 uppercase font-bold">{label}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {type === 'color' && <div className="w-4 h-4 rounded border border-zinc-700 flex-shrink-0" style={{ background: value as string }} />}
                      <span className="text-[11px] text-zinc-300 font-mono">{value as string}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <div className="space-y-1.5">
                  {result.warnings.map((w, i) => (
                    <div key={i} className="flex gap-2 p-2.5 rounded-lg bg-amber-900/20 border border-amber-900/30">
                      <AlertTriangle size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
                      <p className="text-[10px] text-amber-300 leading-relaxed">{w}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setStep('select'); setResult(null); }}
                  className="flex-1 py-2 rounded-xl text-[11px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                >
                  ← Volver
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-2 rounded-xl text-[11px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                >
                  Importar material ✓
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};


export const MaterialPanel: React.FC = () => {
  const { project, updateMaterial, addMaterial, removeMaterial, selectedObjectId, selectedObjectIds, assignMaterialToObjects } = useStore();
  const { materials, objects } = project;
  
  const selectedObject = objects.find(o => o.id === selectedObjectId);
  const activeMaterialId = selectedObject?.materialId;
  
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'library' | 'edit'>('library');
  const [showPBRImport, setShowPBRImport] = useState(false);

  // Categorías y filtrado de la librería procedimental
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const proceduralThumbnails = useMemo(() => generateAllThumbnails(), []);

  // Sync editingMaterialId with activeMaterialId when selection changes
  useEffect(() => {
    if (activeMaterialId) {
      setEditingMaterialId(activeMaterialId);
    }
  }, [activeMaterialId]);

  const currentMaterialId = editingMaterialId || activeMaterialId;
  const activeMaterial = materials.find(m => m.id === currentMaterialId);

  const handleSelectProceduralMaterial = (pMat: ProceduralMaterial) => {
    const maps = generateMaterial(pMat.id, 256, 256);
    const newId = 'mat_' + pMat.id + '_' + Math.random().toString(36).substr(2, 6);
    const d = pMat.defaults;

    const newMat: MaterialData = {
      id: newId,
      name: pMat.name,
      color: '#ffffff',
      map: maps?.albedo,
      normalMap: maps?.normal,
      roughnessMap: maps?.roughness,
      metalnessMap: maps?.metallic,
      aoMap: maps?.ao,
      displacementMap: maps?.displacement,
      roughness: d.roughness ?? 0.5,
      metalness: d.metalness ?? 0.0,
      normalScale: d.normalScale ?? 1.0,
      displacementScale: d.displacementScale ?? 0.0,
      displacementBias: d.displacementBias ?? 0.0,
      clearcoat: d.clearcoat ?? 0.0,
      clearcoatRoughness: d.clearcoatRoughness ?? 0.1,
      sheen: d.sheen ?? 0.0,
      sheenRoughness: d.sheenRoughness ?? 0.5,
      sheenColor: d.sheenColor ?? '#ffffff',
      iridescence: d.iridescence ?? 0.0,
      iridescenceIOR: d.iridescenceIOR ?? 1.3,
      iridescenceThicknessRange: d.iridescenceThicknessRange,
      transmission: d.transmission ?? 0.0,
      ior: d.ior ?? 1.5,
      thickness: d.thickness ?? 0.0,
      emissive: '#000000',
      emissiveIntensity: 1,
      opacity: 1,
      transparent: (d.transmission ?? 0) > 0,
    };

    addMaterial(newMat);
    const ids = (selectedObjectIds && selectedObjectIds.length > 0) 
      ? selectedObjectIds 
      : (selectedObjectId ? [selectedObjectId] : []);
    if (ids.length > 0) {
      assignMaterialToObjects(ids, newMat.id);
    }
    setEditingMaterialId(newMat.id);
    setActiveTab('edit');
  };

  const handleExportMaterial = () => {
    if (!activeMaterial) return;
    const blob = new Blob([JSON.stringify(activeMaterial, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeMaterial.name.replace(/\s+/g, '_')}_PBR.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportMaterial = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev: any) => {
        try {
          const imported = JSON.parse(ev.target.result);
          if (imported.name && (imported.color || imported.map)) {
            // Create a new material from imported data
            const newMat: Omit<MaterialData, 'id'> = {
              ...imported,
              id: undefined // Ensure a new ID is generated
            };
            addMaterial(newMat);
          } else {
            alert('Formato de material PBR no válido');
          }
        } catch (err) {
          alert('Error al cargar el material');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleCreateMaterial = () => {
    const newId = Math.random().toString(36).substr(2, 9);
    const newMat: MaterialData = {
      id: newId,
      name: 'Nuevo Material',
      color: '#ffffff',
      roughness: 0.5,
      metalness: 0.0,
      emissive: '#000000',
      emissiveIntensity: 1,
      opacity: 1,
      transparent: false,
      ior: 1.5,
      transmission: 0,
      thickness: 0,
    };
    addMaterial(newMat);
    setEditingMaterialId(newId);
    setActiveTab('edit');
  };

  const onDropTexture = useCallback(async (e: React.DragEvent, type: 'map' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'aoMap' | 'ormMap') => {
    e.preventDefault();
    if (!activeMaterial) return;

    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      updateMaterial(activeMaterial.id, { [type]: url });
    };
    reader.readAsDataURL(file);
  }, [activeMaterial, updateMaterial]);

  if (activeTab === 'library') {
    return (
      <div className="flex flex-col flex-1 min-h-0 bg-[#141417] text-zinc-300">
        {showPBRImport && (
          <PBRImportModal
            onClose={() => setShowPBRImport(false)}
            onImport={(mat) => {
              const newId = Math.random().toString(36).substr(2, 9);
              addMaterial({ ...mat, id: newId });
            }}
          />
        )}
        
        {/* Header */}
        <div className="p-3 border-b border-white/10 flex items-center justify-between bg-[#18181c]">
          <div className="flex items-center gap-2">
            <Palette size={16} className="text-indigo-400" />
            <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-200">Librería de Materiales</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30">
              {MATERIAL_LIBRARY.length + materials.length}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button 
              onClick={() => setShowPBRImport(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-900/40 hover:bg-indigo-800/60 text-indigo-300 transition-colors text-[10px] font-bold border border-indigo-800/40"
              title="Importar pack PBR (.mtlx, .tres, .usda, PNG...)"
            >
              <FolderOpen size={12} /> Pack PBR
            </button>
            <button 
              onClick={handleImportMaterial}
              className="p-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
              title="Importar Material guardado (.json)"
            >
              <FileUp size={14} />
            </button>
            <button 
              onClick={handleCreateMaterial}
              className="p-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              title="Nuevo Material"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* Buscador y Filtro por Categoría */}
        <div className="p-3 border-b border-white/5 space-y-2.5 bg-[#16161a]">
          {/* Barra de búsqueda */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
            <input 
              type="text" 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              placeholder="Buscar material (ej. Terciopelo, Oro, Mármol...)" 
              className="w-full bg-zinc-900/90 border border-white/10 rounded-xl pl-8 pr-7 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-300">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Categorías (Pills con scroll horizontal) */}
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 text-[11px]">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-all flex items-center gap-1 ${
                selectedCategory === 'all'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>✨</span>
              <span>Todos</span>
            </button>

            <button
              onClick={() => setSelectedCategory('project')}
              className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-all flex items-center gap-1 ${
                selectedCategory === 'project'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Layers size={11} />
              <span>Proyecto</span>
              <span className="opacity-60 text-[9px]">({materials.length})</span>
            </button>

            {MATERIAL_CATEGORIES.map(cat => {
              const count = MATERIAL_LIBRARY.filter(m => m.category === cat.id).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-all flex items-center gap-1 ${
                    selectedCategory === cat.id
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                  <span className="opacity-60 text-[9px]">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Grilla de Materiales */}
        <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-2.5 custom-scrollbar">
          {/* Materiales Procedimentales de la Librería */}
          {selectedCategory !== 'project' && MATERIAL_LIBRARY
            .filter(pMat => {
              if (selectedCategory !== 'all' && pMat.category !== selectedCategory) return false;
              if (searchQuery && !pMat.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
              return true;
            })
            .map(pMat => {
              const thumbUrl = proceduralThumbnails.get(pMat.id);
              const catObj = MATERIAL_CATEGORIES.find(c => c.id === pMat.category);

              return (
                <button
                  key={pMat.id}
                  onClick={() => handleSelectProceduralMaterial(pMat)}
                  className="group relative flex flex-col items-center p-2.5 rounded-xl border border-white/5 bg-zinc-900/40 hover:border-indigo-500/50 hover:bg-indigo-900/10 transition-all text-left overflow-hidden shadow-sm hover:shadow-indigo-500/10"
                >
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-black/40 border border-white/10 relative flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform duration-200">
                    {thumbUrl ? (
                      <img src={thumbUrl} alt={pMat.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl">{pMat.icon}</span>
                    )}
                    <div className="absolute top-1 left-1 bg-black/60 backdrop-blur-md px-1 py-0.5 rounded text-[9px] shadow">
                      {pMat.icon}
                    </div>
                  </div>

                  <span className="mt-2 text-[11px] font-semibold text-zinc-200 group-hover:text-white truncate w-full text-center">
                    {pMat.name}
                  </span>

                  <span className="text-[9px] text-zinc-500 font-medium truncate">
                    {catObj?.label || pMat.category}
                  </span>
                </button>
              );
            })
          }

          {/* Materiales en el Proyecto Actual */}
          {(selectedCategory === 'all' || selectedCategory === 'project') && materials
            .filter(mat => {
              if (searchQuery && !mat.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
              return true;
            })
            .map(mat => (
              <button
                key={mat.id}
                onClick={() => {
                  const ids = (selectedObjectIds && selectedObjectIds.length > 0) ? selectedObjectIds : (selectedObjectId ? [selectedObjectId] : []);
                  if (ids.length > 0) assignMaterialToObjects(ids, mat.id);
                  setEditingMaterialId(mat.id);
                  setActiveTab('edit');
                }}
                className={`group relative flex flex-col items-center p-2.5 rounded-xl border transition-all text-left overflow-hidden ${
                  activeMaterialId === mat.id 
                    ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_12px_rgba(99,102,241,0.2)]' 
                    : 'border-white/5 bg-zinc-900/40 hover:border-white/20'
                }`}
              >
                <div className="relative">
                  <MaterialThumbnail material={mat} size={64} />
                  {activeMaterialId === mat.id && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-indigo-500 border-2 border-zinc-900 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                  )}
                </div>

                <span className="mt-2 text-[11px] font-semibold text-zinc-200 truncate w-full text-center">
                  {mat.name}
                </span>

                <span className="text-[9px] text-indigo-400 font-medium">
                  En Proyecto
                </span>
              </button>
            ))
          }
        </div>
      </div>
    );
  }

  if (!activeMaterial) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center text-zinc-400 space-y-4">
        <Palette size={40} className="opacity-30 text-indigo-400" />
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-300">
            {selectedObject ? `Objeto "${selectedObject.name || 'Sin Nombre'}" Seleccionado` : 'Ningún Objeto Seleccionado'}
          </p>
          <p className="text-[11px] text-zinc-500 max-w-xs">
            {selectedObject 
              ? 'Este objeto aún no tiene un material PBR asignado de la librería.'
              : 'Selecciona un objeto en el visor para vincular un material o abre la librería.'}
          </p>
        </div>
        
        <div className="flex flex-col gap-2 w-full max-w-xs">
          {selectedObject && (
            <button
              onClick={() => {
                const newMat = {
                  id: 'mat_' + Math.random().toString(36).substr(2, 9),
                  name: `Material ${selectedObject.name || 'Objeto'}`,
                  color: selectedObject.material?.color || selectedObject.color || '#ffffff',
                  roughness: selectedObject.material?.roughness ?? 0.5,
                  metalness: selectedObject.material?.metalness ?? 0,
                  emissive: '#000000',
                  emissiveIntensity: 1,
                  opacity: selectedObject.opacity ?? 1,
                  transparent: (selectedObject.opacity ?? 1) < 1,
                };
                addMaterial(newMat);
                const ids = (selectedObjectIds && selectedObjectIds.length > 0) ? selectedObjectIds : [selectedObject.id];
                assignMaterialToObjects(ids, newMat.id);
                setEditingMaterialId(newMat.id);
                setActiveTab('edit');
              }}
              className="py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
            >
              <Plus size={14} /> Crear Nuevo Material PBR
            </button>
          )}

          <button 
            onClick={() => setActiveTab('library')}
            className="py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2"
          >
            <FolderOpen size={14} className="text-indigo-400" /> Explorar Librería / Importar Pack PBR
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[#141417] text-zinc-300 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#1a1a1f]">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setActiveTab('library')}
            className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors flex items-center gap-2 group"
            title="Volver a la Librería"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">Librería</span>
          </button>
          <div className="h-4 w-px bg-white/10 mx-1" />
          <MaterialThumbnail material={activeMaterial} size={32} />
          <input 
            value={activeMaterial.name}
            onChange={e => updateMaterial(activeMaterial.id, { name: e.target.value })}
            className="bg-transparent border-none focus:ring-0 font-bold text-sm p-0 w-32"
          />
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => {
              const ids = (selectedObjectIds && selectedObjectIds.length > 0) ? selectedObjectIds : (selectedObjectId ? [selectedObjectId] : []);
              if (ids.length > 0) assignMaterialToObjects(ids, activeMaterial.id);
            }}
            className="px-2 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold transition-colors mr-2"
            title="Asignar material al objeto seleccionado"
          >
            ASIGNAR
          </button>
          <button 
            onClick={handleExportMaterial}
            className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-indigo-400 transition-colors"
            title="Exportar Material PBR (.json)"
          >
            <Download size={16} />
          </button>
          <button 
            onClick={() => removeMaterial(activeMaterial.id)}
            className="p-1.5 rounded-lg hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors"
            title="Eliminar Material"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        
        {/* Basic Properties */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            <Palette size={12} />
            <span>Propiedades Básicas</span>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] text-zinc-500">Color Base</label>
              <div className="flex items-center gap-2 bg-white/5 p-2 rounded-lg border border-white/5">
                <input 
                  type="color" 
                  value={activeMaterial.color}
                  onChange={e => updateMaterial(activeMaterial.id, { color: e.target.value })}
                  className="w-6 h-6 rounded bg-transparent border-none cursor-pointer"
                />
                <span className="text-[10px] font-mono uppercase">{activeMaterial.color}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] text-zinc-500">Opacidad</label>
              <div className="flex items-center gap-2">
                <input 
                  type="range" min="0" max="1" step="0.01"
                  value={activeMaterial.opacity}
                  onChange={e => updateMaterial(activeMaterial.id, { 
                    opacity: parseFloat(e.target.value),
                    transparent: parseFloat(e.target.value) < 1
                  })}
                  className="flex-1 accent-indigo-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-[10px] font-mono w-8 text-right">{(activeMaterial.opacity * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] text-zinc-500">Rugosidad (Roughness)</label>
              <input 
                type="range" min="0" max="1" step="0.01"
                value={activeMaterial.roughness}
                onChange={e => updateMaterial(activeMaterial.id, { roughness: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] text-zinc-500">Metalicidad (Metalness)</label>
              <input 
                type="range" min="0" max="1" step="0.01"
                value={activeMaterial.metalness}
                onChange={e => updateMaterial(activeMaterial.id, { metalness: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </section>

        {/* Textures Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              <Layers size={12} />
              <span>Mapas de Textura</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-zinc-600 uppercase font-bold">Flip Y</span>
                <button 
                  onClick={() => updateMaterial(activeMaterial.id, { flipY: !(activeMaterial.flipY ?? true) })}
                  className={`w-8 h-4 rounded-full transition-colors relative ${activeMaterial.flipY ?? true ? 'bg-indigo-600' : 'bg-zinc-800'}`}
                >
                  <div className={`absolute top-1 w-2 h-2 rounded-full bg-white transition-all ${activeMaterial.flipY ?? true ? 'left-5' : 'left-1'}`} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-zinc-600 uppercase font-bold">Usar ORM</span>
                <button 
                  onClick={() => updateMaterial(activeMaterial.id, { useORM: !activeMaterial.useORM })}
                  className={`w-8 h-4 rounded-full transition-colors relative ${activeMaterial.useORM ? 'bg-indigo-600' : 'bg-zinc-800'}`}
                >
                  <div className={`absolute top-1 w-2 h-2 rounded-full bg-white transition-all ${activeMaterial.useORM ? 'left-5' : 'left-1'}`} />
                </button>
              </div>
            </div>
            
            {/* Texture Transformations */}
            <div className="pt-2 border-t border-zinc-800/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-400">Repetición (Scale)</span>
                <div className="flex gap-2">
                  <div className="flex items-center gap-1 bg-black/20 px-2 py-1 rounded border border-white/5">
                    <span className="text-[9px] text-zinc-500">U</span>
                    <input 
                      type="number" step="0.1"
                      value={activeMaterial.mapRepeat?.[0] ?? 1}
                      onChange={e => updateMaterial(activeMaterial.id, { mapRepeat: [parseFloat(e.target.value) || 1, activeMaterial.mapRepeat?.[1] ?? 1] })}
                      className="w-10 bg-transparent text-xs text-white text-right outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-1 bg-black/20 px-2 py-1 rounded border border-white/5">
                    <span className="text-[9px] text-zinc-500">V</span>
                    <input 
                      type="number" step="0.1"
                      value={activeMaterial.mapRepeat?.[1] ?? 1}
                      onChange={e => updateMaterial(activeMaterial.id, { mapRepeat: [activeMaterial.mapRepeat?.[0] ?? 1, parseFloat(e.target.value) || 1] })}
                      className="w-10 bg-transparent text-xs text-white text-right outline-none"
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-400">Desplazamiento (Offset)</span>
                <div className="flex gap-2">
                  <div className="flex items-center gap-1 bg-black/20 px-2 py-1 rounded border border-white/5">
                    <span className="text-[9px] text-zinc-500">U</span>
                    <input 
                      type="number" step="0.05"
                      value={activeMaterial.mapOffset?.[0] ?? 0}
                      onChange={e => updateMaterial(activeMaterial.id, { mapOffset: [parseFloat(e.target.value) || 0, activeMaterial.mapOffset?.[1] ?? 0] })}
                      className="w-10 bg-transparent text-xs text-white text-right outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-1 bg-black/20 px-2 py-1 rounded border border-white/5">
                    <span className="text-[9px] text-zinc-500">V</span>
                    <input 
                      type="number" step="0.05"
                      value={activeMaterial.mapOffset?.[1] ?? 0}
                      onChange={e => updateMaterial(activeMaterial.id, { mapOffset: [activeMaterial.mapOffset?.[0] ?? 0, parseFloat(e.target.value) || 0] })}
                      className="w-10 bg-transparent text-xs text-white text-right outline-none"
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-400">Rotación (Grados)</span>
                <div className="flex items-center gap-1 bg-black/20 px-2 py-1 rounded border border-white/5">
                  <input 
                    type="number" step="5"
                    value={activeMaterial.mapRotation ?? 0}
                    onChange={e => updateMaterial(activeMaterial.id, { mapRotation: parseFloat(e.target.value) || 0 })}
                    className="w-12 bg-transparent text-xs text-white text-right outline-none"
                  />
                  <span className="text-[9px] text-zinc-500">°</span>
                </div>
              </div>
            </div>

            {activeMaterial.useORM && (activeMaterial.aoMap || activeMaterial.roughnessMap || activeMaterial.metalnessMap) && (
              <button 
                onClick={() => useStore.getState().generateORM(activeMaterial.id)}
                className="px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 text-[9px] font-bold rounded border border-indigo-500/30 transition-colors"
              >
                GENERAR ORM
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Albedo Map */}
            <TextureSlot 
              label="Albedo / Color" 
              texture={activeMaterial.map} 
              onDrop={e => onDropTexture(e, 'map')}
              onClear={() => updateMaterial(activeMaterial.id, { map: undefined })}
            />
            {/* Normal Map */}
            <TextureSlot 
              label="Normal Map" 
              texture={activeMaterial.normalMap} 
              onDrop={e => onDropTexture(e, 'normalMap')}
              onClear={() => updateMaterial(activeMaterial.id, { normalMap: undefined })}
            />

            {activeMaterial.useORM ? (
              <div className="col-span-2 space-y-3">
                <TextureSlot 
                  label="ORM Map (R:AO, G:Rough, B:Metal)" 
                  texture={activeMaterial.ormMap} 
                  onDrop={e => onDropTexture(e, 'ormMap')}
                  onClear={() => updateMaterial(activeMaterial.id, { ormMap: undefined })}
                  isLarge
                />
                <div className="grid grid-cols-3 gap-2">
                  <IntensityControl 
                    label="AO" 
                    value={activeMaterial.ormIntensityAO ?? 1} 
                    onChange={v => updateMaterial(activeMaterial.id, { ormIntensityAO: v })} 
                  />
                  <IntensityControl 
                    label="Rough" 
                    value={activeMaterial.ormIntensityRoughness ?? 1} 
                    onChange={v => updateMaterial(activeMaterial.id, { ormIntensityRoughness: v })} 
                  />
                  <IntensityControl 
                    label="Metal" 
                    value={activeMaterial.ormIntensityMetalness ?? 1} 
                    onChange={v => updateMaterial(activeMaterial.id, { ormIntensityMetalness: v })} 
                  />
                </div>
                {activeMaterial.ormMap && (
                  <div className="pt-2">
                    <label className="text-[9px] text-zinc-600 font-bold uppercase mb-2 block">Visualizador de Canales</label>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <div className="aspect-square rounded-lg overflow-hidden border border-white/5 relative group">
                          <img src={activeMaterial.ormMap} className="w-full h-full object-cover grayscale brightness-150 contrast-125" style={{ filter: 'matrix(1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1)' }} />
                          <div className="absolute inset-0 bg-red-500/20 mix-blend-multiply" />
                          <div className="absolute bottom-1 left-1 text-[7px] font-bold bg-black/60 px-1 rounded text-red-400">R (AO)</div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="aspect-square rounded-lg overflow-hidden border border-white/5 relative group">
                          <img src={activeMaterial.ormMap} className="w-full h-full object-cover grayscale brightness-150 contrast-125" style={{ filter: 'matrix(0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1)' }} />
                          <div className="absolute inset-0 bg-green-500/20 mix-blend-multiply" />
                          <div className="absolute bottom-1 left-1 text-[7px] font-bold bg-black/60 px-1 rounded text-green-400">G (ROUGH)</div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="aspect-square rounded-lg overflow-hidden border border-white/5 relative group">
                          <img src={activeMaterial.ormMap} className="w-full h-full object-cover grayscale brightness-150 contrast-125" style={{ filter: 'matrix(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)' }} />
                          <div className="absolute inset-0 bg-blue-500/20 mix-blend-multiply" />
                          <div className="absolute bottom-1 left-1 text-[7px] font-bold bg-black/60 px-1 rounded text-blue-400">B (METAL)</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <TextureSlot 
                  label="Roughness" 
                  texture={activeMaterial.roughnessMap} 
                  onDrop={e => onDropTexture(e, 'roughnessMap')}
                  onClear={() => updateMaterial(activeMaterial.id, { roughnessMap: undefined })}
                />
                <TextureSlot 
                  label="Metalness" 
                  texture={activeMaterial.metalnessMap} 
                  onDrop={e => onDropTexture(e, 'metalnessMap')}
                  onClear={() => updateMaterial(activeMaterial.id, { metalnessMap: undefined })}
                />
                <TextureSlot 
                  label="Ambient Occlusion" 
                  texture={activeMaterial.aoMap} 
                  onDrop={e => onDropTexture(e, 'aoMap')}
                  onClear={() => updateMaterial(activeMaterial.id, { aoMap: undefined })}
                />
              </>
            )}
          </div>
        </section>

        {/* Advanced Physical Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            <Zap size={12} />
            <span>Propiedades Físicas Avanzadas</span>
          </div>

          <div className="space-y-4 bg-white/5 p-3 rounded-xl border border-white/5">
            {/* Transmission */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] text-zinc-400">Transmisión (Vidrio)</label>
                <span className="text-[10px] font-mono">{(activeMaterial.transmission ?? 0).toFixed(2)}</span>
              </div>
              <input 
                type="range" min="0" max="1" step="0.01"
                value={activeMaterial.transmission ?? 0}
                onChange={e => updateMaterial(activeMaterial.id, { 
                  transmission: parseFloat(e.target.value),
                  transparent: parseFloat(e.target.value) > 0 || activeMaterial.opacity < 1
                })}
                className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Clearcoat */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] text-zinc-400">Barniz (Clearcoat)</label>
                <span className="text-[10px] font-mono">{(activeMaterial.clearcoat ?? 0).toFixed(2)}</span>
              </div>
              <input 
                type="range" min="0" max="1" step="0.01"
                value={activeMaterial.clearcoat ?? 0}
                onChange={e => updateMaterial(activeMaterial.id, { clearcoat: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Emissive */}
            <div className="space-y-3 pt-2 border-t border-white/5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-zinc-400">Emisión (Glow)</label>
                <input 
                  type="color" 
                  value={activeMaterial.emissive}
                  onChange={e => updateMaterial(activeMaterial.id, { emissive: e.target.value })}
                  className="w-6 h-6 rounded bg-transparent border-none cursor-pointer"
                />
              </div>
              <div className="flex items-center gap-3">
                <Sun size={12} className="text-yellow-400" />
                <input 
                  type="range" min="0" max="20" step="0.1"
                  value={activeMaterial.emissiveIntensity}
                  onChange={e => updateMaterial(activeMaterial.id, { emissiveIntensity: parseFloat(e.target.value) })}
                  className="flex-1 accent-yellow-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-[10px] font-mono w-6">{activeMaterial.emissiveIntensity}</span>
              </div>
            </div>

            {/* Sheen */}
            <div className="space-y-3 pt-2 border-t border-white/5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] text-zinc-400">Terciopelo (Sheen)</label>
                <span className="text-[10px] font-mono">{(activeMaterial.sheen ?? 0).toFixed(2)}</span>
              </div>
              <input 
                type="range" min="0" max="1" step="0.01"
                value={activeMaterial.sheen ?? 0}
                onChange={e => updateMaterial(activeMaterial.id, { sheen: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
              />
              {activeMaterial.sheen! > 0 && (
                <div className="flex items-center justify-between">
                  <label className="text-[9px] text-zinc-500">Color Sheen</label>
                  <input 
                    type="color" 
                    value={activeMaterial.sheenColor || '#ffffff'}
                    onChange={e => updateMaterial(activeMaterial.id, { sheenColor: e.target.value })}
                    className="w-5 h-5 rounded bg-transparent border-none cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Iridescence */}
            <div className="space-y-3 pt-2 border-t border-white/5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] text-zinc-400">Iridiscencia</label>
                <span className="text-[10px] font-mono">{(activeMaterial.iridescence ?? 0).toFixed(2)}</span>
              </div>
              <input 
                type="range" min="0" max="1" step="0.01"
                value={activeMaterial.iridescence ?? 0}
                onChange={e => updateMaterial(activeMaterial.id, { iridescence: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Specular */}
            <div className="space-y-3 pt-2 border-t border-white/5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] text-zinc-400">Especular (Intensidad)</label>
                <span className="text-[10px] font-mono">{(activeMaterial.specularIntensity ?? 1).toFixed(2)}</span>
              </div>
              <input 
                type="range" min="0" max="1" step="0.01"
                value={activeMaterial.specularIntensity ?? 1}
                onChange={e => updateMaterial(activeMaterial.id, { specularIntensity: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

const TextureSlot: React.FC<{ 
  label: string; 
  texture?: string; 
  onDrop: (e: React.DragEvent) => void; 
  onClear: () => void;
  isLarge?: boolean;
}> = ({ label, texture, onDrop, onClear, isLarge }) => {
  const [isOver, setIsOver] = useState(false);

  return (
    <div className={`space-y-1.5 ${isLarge ? 'col-span-2' : ''}`}>
      <label className="text-[9px] text-zinc-600 font-bold uppercase tracking-tighter">{label}</label>
      <div
        onDragOver={e => { e.preventDefault(); setIsOver(true); }}
        onDragLeave={() => setIsOver(false)}
        onDrop={e => { onDrop(e); setIsOver(false); }}
        className={`relative group aspect-square rounded-xl border-2 border-dashed transition-all flex flex-col items-center justify-center overflow-hidden ${
          texture 
            ? 'border-indigo-500/50 bg-indigo-500/5' 
            : isOver ? 'border-indigo-400 bg-indigo-400/10' : 'border-white/5 bg-white/5 hover:border-white/10'
        } ${isLarge ? 'aspect-[2/1]' : ''}`}
      >
        {texture ? (
          <>
            <img src={texture} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity" />
            <button 
              onClick={onClear}
              className="absolute top-2 right-2 p-1 rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
            >
              <Trash2 size={12} />
            </button>
            <div className="z-10 text-[8px] font-bold text-white bg-black/40 px-2 py-1 rounded-full backdrop-blur-sm">
              CAMBIAR
            </div>
          </>
        ) : (
          <>
            <Upload size={16} className={`mb-1 transition-colors ${isOver ? 'text-indigo-400' : 'text-zinc-700'}`} />
            <span className="text-[8px] text-zinc-600 font-medium">DROP IMAGE</span>
          </>
        )}
      </div>
    </div>
  );
};

const IntensityControl: React.FC<{ label: string; value: number; onChange: (v: number) => void }> = ({ label, value, onChange }) => (
  <div className="space-y-1">
    <div className="flex justify-between items-center px-1">
      <span className="text-[8px] font-bold text-zinc-600">{label}</span>
      <span className="text-[8px] font-mono text-zinc-400">{value.toFixed(1)}</span>
    </div>
    <input 
      type="range" min="0" max="2" step="0.1"
      value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
      className="w-full accent-indigo-500 h-1 bg-white/5 rounded-lg appearance-none cursor-pointer"
    />
  </div>
);
