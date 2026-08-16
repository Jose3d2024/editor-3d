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
  Sparkles,
  Grid,
  Disc,
  Feather,
  Shield,
  Gem,
  Glasses,
  Flame,
  ChevronDown,
  ChevronRight,
  Sliders,
  RotateCw,
  Copy,
  Image as ImageIcon,
  Check
} from 'lucide-react';
import { createORMMap } from '../utils/materialUtils';
import { applyUVWMapping, generateUVs } from '../utils/modifiers';
import { importPBRPack, detectSlotFromFilename, importTextureFile } from '../utils/materialImporter';
import { 
  MATERIAL_LIBRARY, 
  MATERIAL_CATEGORIES, 
  generateMaterial, 
  generateMaterialWithFilters,
  MaterialFilters,
  generateAllThumbnails,
  generateAllThumbnailsAsync,
  ProceduralMaterial 
} from '../utils/proceduralTextures';

// ── Presets Físicos Calibrados de Acceso Rápido ────────────────────────────
const PHYSICALLY_CALIBRATED_PRESETS: {
  name: string;
  category: string;
  icon: string;
  description: string;
  apply: Partial<MaterialData>;
}[] = [
  // Metales PBR
  {
    name: 'Oro 24K',
    category: 'Metales',
    icon: '🪙',
    description: 'Metal noble reflectante calibrado',
    apply: { color: '#ffd700', metalness: 1.0, roughness: 0.08, specularIntensity: 1.0, clearcoat: 0, transmission: 0, sheen: 0, anisotropy: 0, iridescence: 0 }
  },
  {
    name: 'Cobre Puro',
    category: 'Metales',
    icon: '🥉',
    description: 'Cobre pulido con reflectancia física',
    apply: { color: '#f5957a', metalness: 1.0, roughness: 0.15, specularIntensity: 1.0, transmission: 0 }
  },
  {
    name: 'Acero Inox Cepillado',
    category: 'Metales',
    icon: '⚙️',
    description: 'Anisotropía con reflejos estirados',
    apply: { color: '#e5e7eb', metalness: 0.95, roughness: 0.28, anisotropy: 0.85, anisotropyRotation: 0, transmission: 0 }
  },
  {
    name: 'Cromo Espejo',
    category: 'Metales',
    icon: '🪞',
    description: 'Reflexión pura sin difusión',
    apply: { color: '#ffffff', metalness: 1.0, roughness: 0.02, clearcoat: 0, transmission: 0 }
  },
  {
    name: 'Disco Vinilo / Radial',
    category: 'Metales',
    icon: '💿',
    description: 'Surcos circulares con anisotropía a 90°',
    apply: { color: '#18181b', metalness: 0.75, roughness: 0.3, anisotropy: 1.0, anisotropyRotation: 90, transmission: 0 }
  },

  // Vidrios & Gemas
  {
    name: 'Vidrio Óptico Claro',
    category: 'Vidrio & Gemas',
    icon: '🪟',
    description: 'Vidrio crown con IOR 1.52',
    apply: { color: '#ffffff', roughness: 0.02, metalness: 0.0, transmission: 1.0, ior: 1.52, thickness: 1.2, transparent: true, opacity: 1, attenuationDistance: 5.0, attenuationColor: '#ffffff' }
  },
  {
    name: 'Vidrio Esmerilado',
    category: 'Vidrio & Gemas',
    icon: '🧊',
    description: 'Vidrio arenado mate difuso',
    apply: { color: '#f8fafc', roughness: 0.38, metalness: 0.0, transmission: 0.95, ior: 1.50, thickness: 1.0, transparent: true, opacity: 1 }
  },
  {
    name: 'Diamante Puro',
    category: 'Vidrio & Gemas',
    icon: '💎',
    description: 'IOR 2.42 y dispersión prismática',
    apply: { color: '#ffffff', roughness: 0.01, metalness: 0.0, transmission: 1.0, ior: 2.42, dispersion: 0.08, thickness: 1.5, transparent: true }
  },
  {
    name: 'Rubí Carmesí',
    category: 'Vidrio & Gemas',
    icon: '🩸',
    description: 'Corindón con absorción roja',
    apply: { color: '#ffffff', roughness: 0.03, transmission: 0.92, ior: 1.77, attenuationColor: '#e11d48', attenuationDistance: 0.6, thickness: 2.0, transparent: true }
  },
  {
    name: 'Esmeralda Verde',
    category: 'Vidrio & Gemas',
    icon: '💚',
    description: 'Berilo translúcido verde',
    apply: { color: '#ffffff', roughness: 0.04, transmission: 0.9, ior: 1.58, attenuationColor: '#059669', attenuationDistance: 0.5, thickness: 2.0, transparent: true }
  },
  {
    name: 'Ámbar Fósil',
    category: 'Vidrio & Gemas',
    icon: '🍯',
    description: 'Resina cálida con absorción ámbar',
    apply: { color: '#ffffff', roughness: 0.08, transmission: 0.85, ior: 1.55, attenuationColor: '#f59e0b', attenuationDistance: 0.8, thickness: 1.5, transparent: true }
  },
  {
    name: 'Agua Cristalina',
    category: 'Vidrio & Gemas',
    icon: '💧',
    description: 'Líquido diáfano IOR 1.333',
    apply: { color: '#f0f9ff', roughness: 0.02, metalness: 0.0, transmission: 1.0, ior: 1.333, thickness: 2.0, transparent: true }
  },

  // Lacados & Pinturas
  {
    name: 'Pintura Candy Red',
    category: 'Lacados & Pinturas',
    icon: '🏎️',
    description: 'Metalizado con laca de alto brillo',
    apply: { color: '#c8001a', metalness: 0.65, roughness: 0.25, clearcoat: 1.0, clearcoatRoughness: 0.04, specularIntensity: 1.2, transmission: 0 }
  },
  {
    name: 'Fibra Carbono Lacada',
    category: 'Lacados & Pinturas',
    icon: '🏁',
    description: 'Compuesto oscuro con barniz epoxi',
    apply: { color: '#18181b', metalness: 0.15, roughness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.06, anisotropy: 0.6, transmission: 0 }
  },
  {
    name: 'Cerámica Esmaltada',
    category: 'Lacados & Pinturas',
    icon: '🏺',
    description: 'Porcelana con esmalte vítreo',
    apply: { color: '#fafafa', metalness: 0.0, roughness: 0.18, clearcoat: 0.95, clearcoatRoughness: 0.05, ior: 1.52, transmission: 0 }
  },

  // Textiles & Terciopelos
  {
    name: 'Terciopelo Carmesí',
    category: 'Textiles',
    icon: '🧣',
    description: 'Retro-reflexión de microvellosidades',
    apply: { color: '#7f1d1d', roughness: 0.85, metalness: 0.0, sheen: 1.0, sheenRoughness: 0.35, sheenColor: '#f43f5e', transmission: 0 }
  },
  {
    name: 'Seda Azul Noche',
    category: 'Textiles',
    icon: '👘',
    description: 'Tejido lustroso con sheen azul hielo',
    apply: { color: '#1e3a8a', roughness: 0.4, metalness: 0.05, sheen: 0.85, sheenRoughness: 0.3, sheenColor: '#93c5fd', anisotropy: 0.5, transmission: 0 }
  },

  // Especiales / Iridiscencia
  {
    name: 'Pompa de Jabón',
    category: 'Especiales',
    icon: '🫧',
    description: 'Interferencia de película fina',
    apply: { color: '#ffffff', roughness: 0.02, metalness: 0.0, transmission: 0.98, opacity: 0.35, transparent: true, ior: 1.15, iridescence: 1.0, iridescenceIOR: 1.33, iridescenceThicknessRange: [100, 400] }
  },
  {
    name: 'Mancha Petróleo',
    category: 'Especiales',
    icon: '🛢️',
    description: 'Capa delgada con efecto tornasol',
    apply: { color: '#111827', roughness: 0.12, metalness: 0.4, iridescence: 1.0, iridescenceIOR: 1.6, iridescenceThicknessRange: [150, 600], transmission: 0 }
  },
  {
    name: 'Nácar / Perla',
    category: 'Especiales',
    icon: '🦪',
    description: 'Reflejos irisados nacarados',
    apply: { color: '#fdfcfb', roughness: 0.22, metalness: 0.05, sheen: 0.45, sheenColor: '#fbcfe8', iridescence: 0.8, iridescenceIOR: 1.5, iridescenceThicknessRange: [200, 500], transmission: 0 }
  }
];

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
  const [activeTab, setActiveTab] = useState<'library' | 'textures' | 'edit'>('library');
  const [showPBRImport, setShowPBRImport] = useState(false);

  // Categorías y filtrado de la librería procedimental
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Estado para la Librería de Texturas integrada
  const [customTextures, setCustomTextures] = useState<Array<{ id: string; name: string; url: string; type: string }>>([]);
  const [textureSearch, setTextureSearch] = useState<string>('');
  const [textureCategory, setTextureCategory] = useState<string>('all');
  const [textureSlotTarget, setTextureSlotTarget] = useState<'map' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'aoMap' | 'displacementMap'>('map');
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);

  const [proceduralThumbnails, setProceduralThumbnails] = useState<Map<string, string>>(() => generateAllThumbnails());

  useEffect(() => {
    generateAllThumbnailsAsync().then(map => {
      setProceduralThumbnails(new Map(map));
    });
  }, []);

  // Sync editingMaterialId with activeMaterialId when selection changes
  useEffect(() => {
    if (activeMaterialId) {
      setEditingMaterialId(activeMaterialId);
    }
  }, [activeMaterialId]);

  const currentMaterialId = editingMaterialId || activeMaterialId;
  const activeMaterial = materials.find(m => m.id === currentMaterialId);

  const handleSelectProceduralMaterial = (pMat: ProceduralMaterial) => {
    const defaultFilters = { rust: 0, scratches: 0, dirt: 0 };
    const maps = generateMaterial(pMat.id, 512, 512, defaultFilters);
    const newId = 'mat_' + pMat.id + '_' + Math.random().toString(36).substr(2, 6);
    const d = pMat.defaults;

    const newMat: MaterialData = {
      id: newId,
      name: pMat.name,
      proceduralBaseId: pMat.id,
      filters: defaultFilters,
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

  const handleFilterChange = (filterKey: 'rust' | 'scratches' | 'dirt', val: number) => {
    if (!activeMaterial) return;
    const currentFilters = activeMaterial.filters || { rust: 0, scratches: 0, dirt: 0 };
    const newFilters: MaterialFilters = { ...currentFilters, [filterKey]: val };
    const baseId = activeMaterial.proceduralBaseId || 'rusted_iron';
    const maps = generateMaterial(baseId, 512, 512, newFilters);
    if (maps) {
      updateMaterial(activeMaterial.id, {
        proceduralBaseId: baseId,
        filters: newFilters,
        map: maps.albedo,
        normalMap: maps.normal,
        roughnessMap: maps.roughness,
        metalnessMap: maps.metallic,
        aoMap: maps.ao,
        displacementMap: maps.displacement,
      });
    }
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

  const onDropTexture = useCallback(async (e: React.DragEvent, type: keyof MaterialData) => {
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

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    presets: true,
    basic: true,
    normal: true,
    glass: true,
    clearcoat: false,
    sheen: false,
    anisotropy: false,
    iridescence: false,
    emissive: false,
    filters: false,
    projection: false,
    maps: true
  });

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAutoUVProjection = useCallback((targetMapping?: string) => {
    if (!activeMaterial) return;
    const mapping = targetMapping || activeMaterial.uvwMapping || 'BOX';
    const state = useStore.getState();
    const targetObjectIds = (selectedObjectIds && selectedObjectIds.length > 0)
      ? selectedObjectIds
      : (selectedObjectId ? [selectedObjectId] : []);
    
    // Find objects with this material or currently selected
    const objectsToUpdate = state.project.objects.filter(obj => 
      targetObjectIds.includes(obj.id) || obj.materialId === activeMaterial.id
    );

    if (objectsToUpdate.length === 0) return;

    const angleThresholdDeg = activeMaterial.uvAngleThreshold ?? 66;
    const islandMargin = activeMaterial.uvIslandMargin ?? 0.02;
    const relaxIterations = activeMaterial.uvRelaxIterations ?? 6;

    objectsToUpdate.forEach(obj => {
      if (obj.vertices && obj.faces && obj.faces.length > 0) {
        const meshData = applyUVWMapping(
          { vertices: obj.vertices, faces: obj.faces.map(f => ({ ...f, uvs: undefined })) },
          mapping,
          { angleThresholdDeg, islandMargin, relaxIterations }
        );
        state.updateObject(obj.id, { vertices: meshData.vertices, faces: meshData.faces });
      }
    });
  }, [activeMaterial, selectedObjectId, selectedObjectIds]);

  // Generar texturas procedimentales + texturas por defecto + texturas del proyecto + texturas de usuario
  const proceduralTexturesList = useMemo(() => {
    const list: Array<{ id: string; name: string; type: string; category: string; url: string; source: string }> = [];

    // 1. Procedural textures from material generators
    const baseMats = ['wood', 'marble', 'rusted_iron', 'concrete', 'tiles', 'brick_wall', 'carbon_fiber', 'leather', 'brushed_metal', 'gold_foil'];
    baseMats.forEach(baseId => {
      const matDef = MATERIAL_LIBRARY.find(m => m.id === baseId);
      const name = matDef?.name || baseId;
      const maps = generateMaterial(baseId, 256, 256, { rust: 0, scratches: 0, dirt: 0 });
      if (maps) {
        if (maps.albedo) list.push({ id: `${baseId}_albedo`, name: `${name} (Albedo / Color)`, type: 'albedo', category: 'albedo', url: maps.albedo, source: 'Procedimental' });
        if (maps.normal) list.push({ id: `${baseId}_normal`, name: `${name} (Normal Map)`, type: 'normal', category: 'normal', url: maps.normal, source: 'Procedimental' });
        if (maps.roughness) list.push({ id: `${baseId}_roughness`, name: `${name} (Rugosidad)`, type: 'roughness', category: 'roughness', url: maps.roughness, source: 'Procedimental' });
        if (maps.metallic) list.push({ id: `${baseId}_metallic`, name: `${name} (Metálico)`, type: 'metalness', category: 'metalness', url: maps.metallic, source: 'Procedimental' });
        if (maps.ao) list.push({ id: `${baseId}_ao`, name: `${name} (Oclusión / AO)`, type: 'ao', category: 'ao', url: maps.ao, source: 'Procedimental' });
        if (maps.displacement) list.push({ id: `${baseId}_disp`, name: `${name} (Desplazamiento)`, type: 'displacement', category: 'displacement', url: maps.displacement, source: 'Procedimental' });
      }
    });

    // 2. UV Calibration test textures
    const uvGridCanvas = document.createElement('canvas');
    uvGridCanvas.width = 256; uvGridCanvas.height = 256;
    const uctx = uvGridCanvas.getContext('2d');
    if (uctx) {
      uctx.fillStyle = '#1e1e24'; uctx.fillRect(0,0,256,256);
      uctx.strokeStyle = '#6366f1'; uctx.lineWidth = 2;
      for(let i=0; i<=256; i+=32){
        uctx.beginPath(); uctx.moveTo(i,0); uctx.lineTo(i,256); uctx.moveTo(0,i); uctx.lineTo(256,i); uctx.stroke();
      }
      uctx.fillStyle = '#a5b4fc'; uctx.font = 'bold 11px sans-serif';
      for(let y=16; y<256; y+=32){ for(let x=10; x<256; x+=32){ uctx.fillText(`U${Math.floor(x/32)}V${Math.floor(y/32)}`, x-6, y+4); }}
      list.push({ id: 'uv_grid_test', name: 'Rejilla Coordenadas UV', type: 'uv_grid', category: 'uv_grid', url: uvGridCanvas.toDataURL(), source: 'Calibración' });
    }

    const uvCheckerCanvas = document.createElement('canvas');
    uvCheckerCanvas.width = 256; uvCheckerCanvas.height = 256;
    const cctx = uvCheckerCanvas.getContext('2d');
    if (cctx) {
      for(let y=0; y<256; y+=32){
        for(let x=0; x<256; x+=32){
          const even = ((x/32)+(y/32))%2===0;
          cctx.fillStyle = even ? '#e4e4e7' : '#18181b';
          cctx.fillRect(x,y,32,32);
        }
      }
      list.push({ id: 'uv_checker_test', name: 'Damero Cuadros UV', type: 'uv_grid', category: 'uv_grid', url: uvCheckerCanvas.toDataURL(), source: 'Calibración' });
    }

    // 3. Project textures from materials
    materials.forEach(mat => {
      if (mat.map && !list.some(t => t.url === mat.map)) {
        list.push({ id: `proj_${mat.id}_map`, name: `${mat.name} (Albedo)`, type: 'albedo', category: 'project', url: mat.map, source: 'Proyecto' });
      }
      if (mat.normalMap && !list.some(t => t.url === mat.normalMap)) {
        list.push({ id: `proj_${mat.id}_norm`, name: `${mat.name} (Normal)`, type: 'normal', category: 'project', url: mat.normalMap, source: 'Proyecto' });
      }
      if (mat.roughnessMap && !list.some(t => t.url === mat.roughnessMap)) {
        list.push({ id: `proj_${mat.id}_rough`, name: `${mat.name} (Rugosidad)`, type: 'roughness', category: 'project', url: mat.roughnessMap, source: 'Proyecto' });
      }
      if (mat.metalnessMap && !list.some(t => t.url === mat.metalnessMap)) {
        list.push({ id: `proj_${mat.id}_met`, name: `${mat.name} (Metálico)`, type: 'metalness', category: 'project', url: mat.metalnessMap, source: 'Proyecto' });
      }
      if (mat.aoMap && !list.some(t => t.url === mat.aoMap)) {
        list.push({ id: `proj_${mat.id}_ao`, name: `${mat.name} (AO)`, type: 'ao', category: 'project', url: mat.aoMap, source: 'Proyecto' });
      }
      if (mat.displacementMap && !list.some(t => t.url === mat.displacementMap)) {
        list.push({ id: `proj_${mat.id}_disp`, name: `${mat.name} (Desplazamiento)`, type: 'displacement', category: 'project', url: mat.displacementMap, source: 'Proyecto' });
      }
    });

    // 4. Custom user uploaded textures
    customTextures.forEach(ct => {
      list.unshift({ id: ct.id, name: ct.name, type: ct.type || 'albedo', category: 'custom', url: ct.url, source: 'Subida por Usuario' });
    });

    return list;
  }, [materials, customTextures]);

  const handleApplyTextureToSelected = useCallback((texUrl: string, targetSlot: 'map' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'aoMap' | 'displacementMap' = textureSlotTarget) => {
    const targetObjId = selectedObjectId;
    if (!targetObjId) {
      alert('Selecciona un objeto en la escena 3D para asignarle la textura.');
      return;
    }
    const obj = objects.find(o => o.id === targetObjId);
    if (!obj) return;

    let targetMatId = obj.materialId;
    if (!targetMatId) {
      targetMatId = 'mat_' + Math.random().toString(36).substr(2, 9);
      const newMat: MaterialData = {
        id: targetMatId,
        name: `Material ${obj.name || 'Objeto'}`,
        color: '#ffffff',
        roughness: 0.5,
        metalness: 0.0,
        emissive: '#000000',
        emissiveIntensity: 1,
        opacity: 1,
        transparent: false,
        [targetSlot]: texUrl,
      };
      addMaterial(newMat);
      assignMaterialToObjects([targetObjId], targetMatId);
      setEditingMaterialId(targetMatId);
    } else {
      updateMaterial(targetMatId, { [targetSlot]: texUrl });
    }

    useStore.getState().setViewMode('TEXTURED');
    useStore.getState().saveHistory();
    setCopiedNotification(`Asignado a "${obj.name || 'Objeto'}" (${targetSlot})`);
    setTimeout(() => setCopiedNotification(null), 2500);
  }, [selectedObjectId, objects, addMaterial, assignMaterialToObjects, setEditingMaterialId, updateMaterial, textureSlotTarget]);

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

        {/* ── SELECTOR SUPERIOR DE PESTAÑAS ── */}
        <div className="flex items-center p-1.5 bg-[#101013] border-b border-white/10 gap-1 flex-shrink-0">
          <button
            onClick={() => setActiveTab('library')}
            className="flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
          >
            <Sparkles size={12} />
            <span>Materiales</span>
          </button>
          <button
            onClick={() => setActiveTab('textures')}
            className="flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
          >
            <ImageIcon size={12} />
            <span>Texturas</span>
          </button>
          <button
            onClick={() => {
              if (activeMaterial) {
                setActiveTab('edit');
              } else if (materials.length > 0) {
                setEditingMaterialId(materials[0].id);
                setActiveTab('edit');
              } else {
                handleCreateMaterial();
              }
            }}
            className="flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
          >
            <Settings size={12} />
            <span>Editor PBR</span>
          </button>
        </div>
        
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

        {/* ── CUADRÍCULA DE MINIATURAS CON SCROLL SEGURO ── */}
        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar min-h-0 min-w-0">
          <div className="grid grid-cols-2 gap-2.5 pb-8">
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
                    className="group relative flex flex-col items-center p-2 rounded-xl border border-white/5 bg-zinc-900/40 hover:border-indigo-500/50 hover:bg-indigo-900/10 transition-all text-left overflow-hidden shadow-sm hover:shadow-indigo-500/10 min-h-[96px]"
                  >
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-black/40 border border-white/10 relative flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform duration-200">
                      {thumbUrl ? (
                        <img src={thumbUrl} alt={pMat.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xl">{pMat.icon}</span>
                      )}
                      <div className="absolute top-0.5 left-0.5 bg-black/60 backdrop-blur-md px-1 py-0.5 rounded text-[8px] shadow">
                        {pMat.icon}
                      </div>
                    </div>

                    <span className="mt-1.5 text-[10px] font-semibold text-zinc-200 group-hover:text-white truncate w-full text-center px-1">
                      {pMat.name}
                    </span>

                    <span className="text-[9px] text-zinc-500 font-medium truncate w-full text-center px-1">
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
                  className={`group relative flex flex-col items-center p-2 rounded-xl border transition-all text-left overflow-hidden min-h-[96px] ${
                    activeMaterialId === mat.id 
                      ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_12px_rgba(99,102,241,0.2)]' 
                      : 'border-white/5 bg-zinc-900/40 hover:border-white/20'
                  }`}
                >
                  <div className="relative">
                    <MaterialThumbnail material={mat} size={48} />
                    {activeMaterialId === mat.id && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-indigo-500 border-2 border-zinc-900 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                    )}
                  </div>

                  <span className="mt-1.5 text-[10px] font-semibold text-zinc-200 truncate w-full text-center px-1">
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
      </div>
    );
  }

  if (activeTab === 'textures') {
    const categories = [
      { id: 'all', label: 'Todas', icon: '✨' },
      { id: 'albedo', label: 'Albedo / Color', icon: '🎨' },
      { id: 'normal', label: 'Normal Maps', icon: '🟣' },
      { id: 'roughness', label: 'Rugosidad', icon: '⚪' },
      { id: 'metalness', label: 'Metálico', icon: '🪙' },
      { id: 'ao', label: 'Oclusión (AO)', icon: '🌑' },
      { id: 'displacement', label: 'Desplazamiento', icon: '🏔️' },
      { id: 'uv_grid', label: 'Calibración UV', icon: '📐' },
      { id: 'custom', label: 'Mis Subidas', icon: '📂' },
    ];

    const filteredTextures = proceduralTexturesList.filter(t => {
      if (textureCategory !== 'all') {
        if (textureCategory === 'custom' && t.source !== 'Subida por Usuario') return false;
        if (textureCategory !== 'custom' && t.category !== textureCategory) return false;
      }
      if (textureSearch && !t.name.toLowerCase().includes(textureSearch.toLowerCase())) return false;
      return true;
    });

    return (
      <div className="flex flex-col flex-1 min-h-0 bg-[#141417] text-zinc-300">
        {/* ── SELECTOR SUPERIOR DE PESTAÑAS ── */}
        <div className="flex items-center p-1.5 bg-[#101013] border-b border-white/10 gap-1 flex-shrink-0">
          <button
            onClick={() => setActiveTab('library')}
            className="flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
          >
            <Sparkles size={12} />
            <span>Materiales</span>
          </button>
          <button
            onClick={() => setActiveTab('textures')}
            className="flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
          >
            <ImageIcon size={12} />
            <span>Texturas</span>
          </button>
          <button
            onClick={() => {
              if (activeMaterial) {
                setActiveTab('edit');
              } else if (materials.length > 0) {
                setEditingMaterialId(materials[0].id);
                setActiveTab('edit');
              } else {
                handleCreateMaterial();
              }
            }}
            className="flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
          >
            <Settings size={12} />
            <span>Editor PBR</span>
          </button>
        </div>

        {/* Header Texturas */}
        <div className="p-3 border-b border-white/10 flex items-center justify-between bg-[#18181c]">
          <div className="flex items-center gap-2">
            <ImageIcon size={16} className="text-emerald-400" />
            <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-200">Librería de Texturas</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
              {filteredTextures.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <label className="cursor-pointer flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-700/80 hover:bg-emerald-600 text-white transition-colors text-[10px] font-bold shadow-sm">
              <Upload size={12} />
              <span>Subir Textura</span>
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev: any) => {
                    const url = ev.target.result as string;
                    const name = file.name.replace(/\.[^/.]+$/, "");
                    const slot = detectSlotFromFilename(file.name);
                    const newTex = {
                      id: 'tex_' + Math.random().toString(36).substr(2, 9),
                      name,
                      url,
                      type: slot === 'albedo' ? 'albedo' : slot,
                    };
                    setCustomTextures(prev => [newTex, ...prev]);
                    setTextureCategory('custom');
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </label>
          </div>
        </div>

        {/* Notificación de asignación */}
        {copiedNotification && (
          <div className="px-3 py-1.5 bg-emerald-900/60 border-b border-emerald-500/30 text-emerald-200 text-[10px] font-medium flex items-center gap-1.5 animate-fadeIn">
            <Check size={12} className="text-emerald-400 flex-shrink-0" />
            <span className="truncate">{copiedNotification}</span>
          </div>
        )}

        {/* Selector de ranura objetivo y buscador */}
        <div className="p-3 border-b border-white/5 space-y-2.5 bg-[#16161a]">
          <div className="flex items-center justify-between gap-2 text-[10px]">
            <span className="text-zinc-400 font-semibold whitespace-nowrap">Ranura al hacer clic:</span>
            <select
              value={textureSlotTarget}
              onChange={e => setTextureSlotTarget(e.target.value as any)}
              className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-2 py-1 text-[11px] font-medium focus:outline-none focus:border-emerald-500"
            >
              <option value="map">Color / Albedo (map)</option>
              <option value="normalMap">Normal Map</option>
              <option value="roughnessMap">Rugosidad (Roughness)</option>
              <option value="metalnessMap">Metálico (Metalness)</option>
              <option value="aoMap">Oclusión Ambiental (AO)</option>
              <option value="displacementMap">Desplazamiento (Height)</option>
            </select>
          </div>

          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
            <input
              type="text"
              value={textureSearch}
              onChange={e => setTextureSearch(e.target.value)}
              placeholder="Buscar textura (ej. Madera, Normal, Mármol...)"
              className="w-full bg-zinc-900/90 border border-white/10 rounded-xl pl-8 pr-7 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
            />
            {textureSearch && (
              <button onClick={() => setTextureSearch('')} className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-300">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Categorías (Pills con scroll horizontal) */}
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 text-[11px]">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setTextureCategory(cat.id)}
                className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-all flex items-center gap-1 ${
                  textureCategory === cat.id
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── CUADRÍCULA DE TEXTURAS ── */}
        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar min-h-0 min-w-0">
          <div className="grid grid-cols-2 gap-3 pb-8">
            {filteredTextures.map(tex => {
              const typeBadgeColors: Record<string, string> = {
                albedo: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
                normal: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
                roughness: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/40',
                metalness: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
                ao: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
                displacement: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
                uv_grid: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
              };

              return (
                <div
                  key={tex.id}
                  className="group relative flex flex-col p-2 rounded-xl border border-white/5 bg-zinc-900/60 hover:border-emerald-500/50 hover:bg-emerald-950/20 transition-all text-left overflow-hidden shadow-sm"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-texture-url', tex.url);
                    e.dataTransfer.setData('application/x-texture-type', tex.type);
                    e.dataTransfer.setData('text/plain', tex.url);
                  }}
                >
                  <div
                    onClick={() => handleApplyTextureToSelected(tex.url, textureSlotTarget)}
                    className="w-full aspect-square rounded-lg overflow-hidden bg-black/50 border border-white/10 relative flex items-center justify-center cursor-pointer group-hover:scale-[1.02] transition-transform duration-200"
                    title="Haz clic para aplicar al objeto seleccionado o arrastra al visor 3D"
                  >
                    <img src={tex.url} alt={tex.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    
                    <div className="absolute top-1.5 left-1.5">
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border backdrop-blur-md uppercase tracking-wider ${typeBadgeColors[tex.type] || 'bg-black/60 text-white'}`}>
                        {tex.type}
                      </span>
                    </div>

                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-[10px] font-bold bg-emerald-600 text-white px-2 py-1 rounded-md shadow-lg">
                        Aplicar
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-col min-w-0">
                    <span className="text-[11px] font-semibold text-zinc-200 truncate group-hover:text-emerald-300">
                      {tex.name}
                    </span>
                    <span className="text-[9px] text-zinc-500 truncate">
                      {tex.source}
                    </span>
                  </div>

                  {/* Acciones rápidas de ranuras */}
                  <div className="mt-2 pt-1.5 border-t border-white/5 flex items-center justify-between gap-1 text-[9px]">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleApplyTextureToSelected(tex.url, 'map'); }}
                      className="flex-1 py-0.5 rounded bg-zinc-800 hover:bg-indigo-600 text-zinc-300 hover:text-white transition-colors text-center font-bold"
                      title="Asignar como Albedo / Color"
                    >
                      Color
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleApplyTextureToSelected(tex.url, 'normalMap'); }}
                      className="flex-1 py-0.5 rounded bg-zinc-800 hover:bg-purple-600 text-zinc-300 hover:text-white transition-colors text-center font-bold"
                      title="Asignar como Normal Map"
                    >
                      Normal
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleApplyTextureToSelected(tex.url, 'roughnessMap'); }}
                      className="flex-1 py-0.5 rounded bg-zinc-800 hover:bg-zinc-600 text-zinc-300 hover:text-white transition-colors text-center font-bold"
                      title="Asignar como Rugosidad"
                    >
                      Rugoso
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Zona de Drop rápida para archivos de imagen */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (ev: any) => {
                  const url = ev.target.result as string;
                  const name = file.name.replace(/\.[^/.]+$/, "");
                  const slot = detectSlotFromFilename(file.name);
                  const newTex = {
                    id: 'tex_' + Math.random().toString(36).substr(2, 9),
                    name,
                    url,
                    type: slot === 'albedo' ? 'albedo' : slot,
                  };
                  setCustomTextures(prev => [newTex, ...prev]);
                  setTextureCategory('custom');
                };
                reader.readAsDataURL(file);
              }
            }}
            className="mt-2 border-2 border-dashed border-zinc-800 hover:border-emerald-500/50 rounded-xl p-4 text-center text-zinc-500 hover:text-zinc-300 transition-colors bg-zinc-950/30"
          >
            <Upload size={18} className="mx-auto mb-1 text-zinc-600" />
            <p className="text-[11px] font-bold text-zinc-400">Arrastra archivos de imagen aquí</p>
            <p className="text-[9px] text-zinc-600 mt-0.5">Soporta PNG, JPG, WebP (Albedo, Normal, Roughness, Metalness, AO)</p>
          </div>
        </div>
      </div>
    );
  }

  if (!activeMaterial) {
    return (
      <div className="flex flex-col flex-1 min-h-0 bg-[#141417] text-zinc-300">
        {/* ── SELECTOR SUPERIOR DE PESTAÑAS ── */}
        <div className="flex items-center p-1.5 bg-[#101013] border-b border-white/10 gap-1 flex-shrink-0">
          <button
            onClick={() => setActiveTab('library')}
            className="flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
          >
            <Sparkles size={12} />
            <span>Materiales</span>
          </button>
          <button
            onClick={() => setActiveTab('textures')}
            className="flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
          >
            <ImageIcon size={12} />
            <span>Texturas</span>
          </button>
          <button
            onClick={() => setActiveTab('edit')}
            className="flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
          >
            <Settings size={12} />
            <span>Editor PBR</span>
          </button>
        </div>

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
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[#141417] text-zinc-300 overflow-hidden">
      {/* ── SELECTOR SUPERIOR DE PESTAÑAS ── */}
      <div className="flex items-center p-1.5 bg-[#101013] border-b border-white/10 gap-1 flex-shrink-0">
        <button
          onClick={() => setActiveTab('library')}
          className="flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
        >
          <Sparkles size={12} />
          <span>Materiales</span>
        </button>
        <button
          onClick={() => setActiveTab('textures')}
          className="flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
        >
          <ImageIcon size={12} />
          <span>Texturas</span>
        </button>
        <button
          onClick={() => setActiveTab('edit')}
          className="flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
        >
          <Settings size={12} />
          <span>Editor PBR</span>
        </button>
      </div>

      {/* Header del Panel Corregido (Evita desbordamiento de Asignar) */}
      <div className="p-3 border-b border-white/10 flex items-center justify-between bg-[#1a1a1f] w-full min-w-0 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Botón Volver Flecha */}
          <button 
            onClick={() => setActiveTab('library')}
            className="p-1 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors flex items-center justify-center flex-shrink-0"
            title="Volver a la Librería"
          >
            <ArrowLeft size={14} />
          </button>
          
          {/* Miniatura del Material */}
          <div className="flex-shrink-0 scale-90">
            <MaterialThumbnail material={activeMaterial} size={28} />
          </div>

          {/* Nombre del Material con elipsis si es muy largo */}
          <input 
            value={activeMaterial.name}
            onChange={e => updateMaterial(activeMaterial.id, { name: e.target.value })}
            className="bg-transparent border-none focus:ring-0 font-bold text-xs p-0 text-white outline-none font-sans min-w-0 flex-1 truncate"
            style={{ minWidth: '50px' }}
          />
        </div>

        {/* Bloque de Botones de Acción Derecho */}
        <div className="flex items-center gap-1 flex-shrink-0 ml-1">
          <button 
            onClick={() => {
              const ids = (selectedObjectIds && selectedObjectIds.length > 0) ? selectedObjectIds : (selectedObjectId ? [selectedObjectId] : []);
              if (ids.length > 0) assignMaterialToObjects(ids, activeMaterial.id);
            }}
            className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black tracking-wider transition-all active:scale-95 flex-shrink-0 shadow-md uppercase"
          >
            ASIGNAR
          </button>

          <button 
            onClick={() => {
              const newId = 'mat_' + Math.random().toString(36).substr(2, 9);
              const clone = { ...activeMaterial, id: newId, name: `${activeMaterial.name} (Copia)` };
              addMaterial(clone);
              setEditingMaterialId(newId);
            }} 
            className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-indigo-400 transition-colors flex-shrink-0" 
            title="Duplicar Material"
          >
            <Copy size={13} />
          </button>
          
          <button 
            onClick={handleExportMaterial} 
            className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-indigo-400 transition-colors flex-shrink-0" 
            title="Exportar Material PBR (.json)"
          >
            <Download size={14} />
          </button>
          
          <button 
            onClick={() => removeMaterial(activeMaterial.id)} 
            className="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors flex-shrink-0" 
            title="Eliminar Material"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Contenido con Scroll Protegido */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar max-w-full overflow-x-hidden">
        
        {/* ── PRESETS FÍSICOS CALIBRADOS DE ACCESO RÁPIDO ── */}
        <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-white/5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 flex items-center gap-1.5">
              <span>✨</span> Presets Físicos Calibrados
            </span>
            <span className="text-[9px] text-zinc-500 font-mono">1-Click</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
            {PHYSICALLY_CALIBRATED_PRESETS.map((preset, idx) => (
              <button
                key={idx}
                onClick={() => updateMaterial(activeMaterial.id, preset.apply)}
                className="px-2 py-1 rounded-lg bg-zinc-800/90 hover:bg-indigo-600/30 text-zinc-300 hover:text-white border border-white/5 hover:border-indigo-500/40 text-[10px] font-medium whitespace-nowrap transition-all flex items-center gap-1 flex-shrink-0 shadow-sm"
                title={`${preset.name}: ${preset.description}`}
              >
                <span>{preset.icon}</span>
                <span>{preset.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── SECCIÓN 1: SUPERFICIE BASE & COLOR ── */}
        <div className="bg-zinc-900/40 rounded-xl border border-white/5 overflow-hidden">
          <button 
            onClick={() => toggleSection('basic')}
            className="w-full p-2.5 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-300">
              <Palette size={13} className="text-indigo-400" />
              <span>Superficie Base & Color</span>
            </div>
            {openSections.basic ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
          </button>
          
          {openSections.basic && (
            <div className="p-3 pt-1 space-y-3 border-t border-white/5">
              {/* Color Base & Opacidad */}
              <div className="grid grid-cols-2 gap-3 items-end">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500">Color Base</label>
                  <div className="flex items-center gap-2 bg-white/5 p-1.5 h-8 rounded-lg border border-white/5">
                    <input 
                      type="color" 
                      value={activeMaterial.color}
                      onChange={e => updateMaterial(activeMaterial.id, { color: e.target.value })}
                      className="w-5 h-5 rounded bg-transparent border-none cursor-pointer"
                    />
                    <span className="text-[10px] font-mono uppercase text-zinc-300">{activeMaterial.color}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px]">
                    <label className="text-zinc-500">Opacidad</label>
                    <span className="font-mono text-indigo-400">{(activeMaterial.opacity * 100).toFixed(0)}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.01"
                    value={activeMaterial.opacity}
                    onChange={e => updateMaterial(activeMaterial.id, { 
                      opacity: parseFloat(e.target.value),
                      transparent: parseFloat(e.target.value) < 1 || (activeMaterial.transmission ?? 0) > 0
                    })}
                    className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              {/* Rugosidad & Metalicidad */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px]">
                    <label className="text-zinc-500">Rugosidad (Roughness)</label>
                    <span className="font-mono text-zinc-400">{(activeMaterial.roughness ?? 0.5).toFixed(2)}</span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.01"
                    value={activeMaterial.roughness}
                    onChange={e => updateMaterial(activeMaterial.id, { roughness: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg cursor-pointer"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px]">
                    <label className="text-zinc-500">Metalicidad (Metalness)</label>
                    <span className="font-mono text-zinc-400">{(activeMaterial.metalness ?? 0.0).toFixed(2)}</span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.01"
                    value={activeMaterial.metalness}
                    onChange={e => updateMaterial(activeMaterial.id, { metalness: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              {/* Intensidad Especular */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <label className="text-zinc-500">Reflejo Especular (Specular Intensity)</label>
                  <span className="font-mono text-zinc-400">{(activeMaterial.specularIntensity ?? 1.0).toFixed(2)}</span>
                </div>
                <input 
                  type="range" min="0" max="2" step="0.05"
                  value={activeMaterial.specularIntensity ?? 1.0}
                  onChange={e => updateMaterial(activeMaterial.id, { specularIntensity: parseFloat(e.target.value) })}
                  className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── SECCIÓN 2: MAPAS NORMALES & FORMATO DIRECTX / OPENGL ── */}
        <div className="bg-zinc-900/40 rounded-xl border border-white/5 overflow-hidden">
          <button 
            onClick={() => toggleSection('normal')}
            className="w-full p-2.5 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-300">
              <Sliders size={13} className="text-cyan-400" />
              <span>Normales & Relieve PBR</span>
              {activeMaterial.normalFormat === 'DIRECTX' && (
                <span className="text-[8px] bg-cyan-500/20 text-cyan-300 px-1 rounded border border-cyan-500/30">DirectX (-Y)</span>
              )}
            </div>
            {openSections.normal ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
          </button>

          {openSections.normal && (
            <div className="p-3 pt-1 space-y-3 border-t border-white/5">
              {/* Selector de Formato Normal Map (DirectX vs OpenGL) */}
              <div className="space-y-1.5 bg-black/20 p-2.5 rounded-lg border border-white/5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-semibold text-zinc-300">Formato de Normal Map</label>
                  <span className="text-[9px] text-zinc-500 font-mono">
                    {activeMaterial.normalFormat === 'DIRECTX' || activeMaterial.invertNormalY ? 'Canal Y Invertido (-Y)' : 'Estándar (+Y)'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => updateMaterial(activeMaterial.id, { normalFormat: 'OPENGL', invertNormalY: false })}
                    className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border transition-all text-center ${
                      (activeMaterial.normalFormat !== 'DIRECTX' && !activeMaterial.invertNormalY)
                        ? 'bg-cyan-600/30 text-cyan-300 border-cyan-500 shadow-sm'
                        : 'bg-zinc-800/60 text-zinc-400 border-white/5 hover:bg-zinc-800'
                    }`}
                  >
                    OpenGL (+Y)
                    <span className="block text-[8px] font-normal text-zinc-400">Blender / Three.js / Maya</span>
                  </button>
                  <button
                    onClick={() => updateMaterial(activeMaterial.id, { normalFormat: 'DIRECTX', invertNormalY: true })}
                    className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border transition-all text-center ${
                      (activeMaterial.normalFormat === 'DIRECTX' || activeMaterial.invertNormalY)
                        ? 'bg-cyan-600/30 text-cyan-300 border-cyan-500 shadow-sm'
                        : 'bg-zinc-800/60 text-zinc-400 border-white/5 hover:bg-zinc-800'
                    }`}
                  >
                    DirectX (-Y)
                    <span className="block text-[8px] font-normal text-zinc-400">cgbookcase / Unreal / 3ds Max</span>
                  </button>
                </div>
                <p className="text-[8px] text-zinc-500 leading-tight pt-1">
                  * cgbookcase y Unreal usan normales DirectX (-Y). Si el relieve se ve hundido o invertido con la luz, activa DirectX (-Y).
                </p>
              </div>

              {/* Fuerza de Normal Map */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <label className="text-zinc-500">Escala de Normales (Normal Scale)</label>
                  <span className="font-mono text-cyan-400">{(activeMaterial.normalScale ?? 1.0).toFixed(2)}</span>
                </div>
                <input 
                  type="range" min="0" max="3" step="0.05"
                  value={activeMaterial.normalScale ?? 1.0}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    updateMaterial(activeMaterial.id, { normalScale: val });
                  }}
                  className="w-full accent-cyan-500 h-1 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>

              {/* Relieve Geométrico (Displacement) */}
              <div className="space-y-1.5 bg-white/5 p-2 rounded-lg border border-white/5">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-zinc-300 font-semibold">Fuerza de Relieve (Displacement Scale)</span>
                  <span className="font-mono text-cyan-400">{(activeMaterial.displacementScale ?? 0.0).toFixed(3)}</span>
                </div>
                <input 
                  type="range" min="0" max="0.08" step="0.001" 
                  value={activeMaterial.displacementScale ?? 0.0} 
                  onChange={(e) => updateMaterial(activeMaterial.id, { displacementScale: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-500 h-1 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── SECCIÓN 3: VIDRIO, TRANSMISIÓN Y GEMAS ── */}
        <div className="bg-zinc-900/40 rounded-xl border border-white/5 overflow-hidden">
          <button 
            onClick={() => toggleSection('glass')}
            className="w-full p-2.5 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-300">
              <Glasses size={13} className="text-blue-400" />
              <span>Vidrio, Transmisión & Gemas</span>
              {(activeMaterial.transmission ?? 0) > 0 && (
                <span className="text-[8px] bg-blue-500/20 text-blue-300 px-1 rounded border border-blue-500/30">
                  {((activeMaterial.transmission ?? 0) * 100).toFixed(0)}%
                </span>
              )}
            </div>
            {openSections.glass ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
          </button>

          {openSections.glass && (
            <div className="p-3 pt-1 space-y-3 border-t border-white/5">
              {/* Slider Transmisión */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <label className="text-zinc-400">Transmisión (Vidrio / Refracción)</label>
                  <span className="font-mono text-blue-400 font-bold">{((activeMaterial.transmission ?? 0) * 100).toFixed(0)}%</span>
                </div>
                <input 
                  type="range" min="0" max="1" step="0.01"
                  value={activeMaterial.transmission ?? 0}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    updateMaterial(activeMaterial.id, { 
                      transmission: val,
                      transparent: val > 0 || (activeMaterial.opacity ?? 1) < 1
                    });
                  }}
                  className="w-full accent-blue-500 h-1 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>

              {/* Selector de IOR con Presets Rápidos */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <label className="text-zinc-400">Índice de Refracción (IOR)</label>
                  <span className="font-mono text-blue-300 font-bold">{(activeMaterial.ior ?? 1.5).toFixed(3)}</span>
                </div>
                <input 
                  type="range" min="1.0" max="3.0" step="0.01"
                  value={activeMaterial.ior ?? 1.5}
                  onChange={e => updateMaterial(activeMaterial.id, { ior: parseFloat(e.target.value) })}
                  className="w-full accent-blue-500 h-1 bg-white/10 rounded-lg cursor-pointer"
                />
                <div className="grid grid-cols-4 gap-1 pt-1">
                  {[
                    { label: 'Aire (1.0)', val: 1.0 },
                    { label: 'Agua (1.33)', val: 1.333 },
                    { label: 'Vidrio (1.52)', val: 1.52 },
                    { label: 'Diamante (2.42)', val: 2.417 },
                  ].map(iorP => (
                    <button
                      key={iorP.label}
                      onClick={() => updateMaterial(activeMaterial.id, { ior: iorP.val })}
                      className={`py-1 rounded text-[8px] font-bold transition-all border ${
                        Math.abs((activeMaterial.ior ?? 1.5) - iorP.val) < 0.02
                          ? 'bg-blue-600/30 text-blue-200 border-blue-500'
                          : 'bg-zinc-800/80 text-zinc-400 border-white/5 hover:bg-zinc-800'
                      }`}
                    >
                      {iorP.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dispersión Cromática (Prisma / Arcoíris) */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <label className="text-zinc-400">Dispersión Cromática (Prisma)</label>
                  <span className="font-mono text-indigo-400">{(activeMaterial.dispersion ?? 0.0).toFixed(3)}</span>
                </div>
                <input 
                  type="range" min="0" max="0.2" step="0.005"
                  value={activeMaterial.dispersion ?? 0.0}
                  onChange={e => updateMaterial(activeMaterial.id, { dispersion: parseFloat(e.target.value) })}
                  className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>

              {/* Espesor y Atenuación Volumétrica */}
              <div className="space-y-2 bg-black/20 p-2.5 rounded-lg border border-white/5">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px]">
                    <label className="text-zinc-400">Espesor Volumétrico (Thickness)</label>
                    <span className="font-mono text-zinc-300">{(activeMaterial.thickness ?? 0.0).toFixed(2)}</span>
                  </div>
                  <input 
                    type="range" min="0" max="5.0" step="0.05"
                    value={activeMaterial.thickness ?? 0.0}
                    onChange={e => updateMaterial(activeMaterial.id, { thickness: parseFloat(e.target.value) })}
                    className="w-full accent-blue-400 h-1 bg-white/10 rounded-lg cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="space-y-1">
                    <label className="text-[9px] text-zinc-500">Color de Atenuación</label>
                    <div className="flex items-center gap-1.5 bg-white/5 p-1 rounded border border-white/5">
                      <input 
                        type="color" 
                        value={activeMaterial.attenuationColor || '#ffffff'}
                        onChange={e => updateMaterial(activeMaterial.id, { attenuationColor: e.target.value })}
                        className="w-4 h-4 rounded bg-transparent border-none cursor-pointer"
                      />
                      <span className="text-[9px] font-mono text-zinc-300">{activeMaterial.attenuationColor || '#ffffff'}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px]">
                      <label className="text-zinc-500">Distancia</label>
                      <span className="font-mono text-zinc-400">{activeMaterial.attenuationDistance ?? 1.0}</span>
                    </div>
                    <input 
                      type="range" min="0.1" max="10" step="0.1"
                      value={activeMaterial.attenuationDistance ?? 1.0}
                      onChange={e => updateMaterial(activeMaterial.id, { attenuationDistance: parseFloat(e.target.value) })}
                      className="w-full accent-blue-400 h-1 bg-white/10 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── SECCIÓN 4: ANISOTROPÍA (METALES CEPILLADOS & DISCOS) ── */}
        <div className="bg-zinc-900/40 rounded-xl border border-white/5 overflow-hidden">
          <button 
            onClick={() => toggleSection('anisotropy')}
            className="w-full p-2.5 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-300">
              <Disc size={13} className="text-emerald-400" />
              <span>Anisotropía (Metales Cepillados & Radial)</span>
              {(activeMaterial.anisotropy ?? 0) > 0 && (
                <span className="text-[8px] bg-emerald-500/20 text-emerald-300 px-1 rounded border border-emerald-500/30">
                  {((activeMaterial.anisotropy ?? 0) * 100).toFixed(0)}%
                </span>
              )}
            </div>
            {openSections.anisotropy ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
          </button>

          {openSections.anisotropy && (
            <div className="p-3 pt-1 space-y-3 border-t border-white/5">
              <p className="text-[9px] text-zinc-400 leading-tight">
                Estira los brillos especulares en una dirección angular (aluminio cepillado, surcos de discos de vinilo, sartenes).
              </p>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <label className="text-zinc-400">Intensidad de Anisotropía</label>
                  <span className="font-mono text-emerald-400 font-bold">{((activeMaterial.anisotropy ?? 0) * 100).toFixed(0)}%</span>
                </div>
                <input 
                  type="range" min="0" max="1" step="0.01"
                  value={activeMaterial.anisotropy ?? 0}
                  onChange={e => updateMaterial(activeMaterial.id, { anisotropy: parseFloat(e.target.value) })}
                  className="w-full accent-emerald-500 h-1 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <label className="text-zinc-400">Rotación de la Anisotropía</label>
                  <span className="font-mono text-zinc-300">{(activeMaterial.anisotropyRotation ?? 0).toFixed(0)}°</span>
                </div>
                <input 
                  type="range" min="0" max="360" step="1"
                  value={activeMaterial.anisotropyRotation ?? 0}
                  onChange={e => updateMaterial(activeMaterial.id, { anisotropyRotation: parseFloat(e.target.value) })}
                  className="w-full accent-emerald-500 h-1 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── SECCIÓN 5: BARNIZ Y LACADOS (CLEARCOAT) ── */}
        <div className="bg-zinc-900/40 rounded-xl border border-white/5 overflow-hidden">
          <button 
            onClick={() => toggleSection('clearcoat')}
            className="w-full p-2.5 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-300">
              <Shield size={13} className="text-amber-400" />
              <span>Barniz & Lacados (Clearcoat)</span>
              {(activeMaterial.clearcoat ?? 0) > 0 && (
                <span className="text-[8px] bg-amber-500/20 text-amber-300 px-1 rounded border border-amber-500/30">
                  {((activeMaterial.clearcoat ?? 0) * 100).toFixed(0)}%
                </span>
              )}
            </div>
            {openSections.clearcoat ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
          </button>

          {openSections.clearcoat && (
            <div className="p-3 pt-1 space-y-3 border-t border-white/5">
              <p className="text-[9px] text-zinc-400 leading-tight">
                Simula una capa exterior de barniz brillante sobre la superficie base (pintura de carrocerías, fibra de carbono lacada, madera tratada).
              </p>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <label className="text-zinc-400">Intensidad de Barniz (Clearcoat)</label>
                  <span className="font-mono text-amber-400 font-bold">{((activeMaterial.clearcoat ?? 0) * 100).toFixed(0)}%</span>
                </div>
                <input 
                  type="range" min="0" max="1" step="0.01"
                  value={activeMaterial.clearcoat ?? 0}
                  onChange={e => updateMaterial(activeMaterial.id, { clearcoat: parseFloat(e.target.value) })}
                  className="w-full accent-amber-500 h-1 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <label className="text-zinc-400">Rugosidad del Barniz (Clearcoat Roughness)</label>
                  <span className="font-mono text-zinc-300">{(activeMaterial.clearcoatRoughness ?? 0.05).toFixed(2)}</span>
                </div>
                <input 
                  type="range" min="0" max="1" step="0.01"
                  value={activeMaterial.clearcoatRoughness ?? 0.05}
                  onChange={e => updateMaterial(activeMaterial.id, { clearcoatRoughness: parseFloat(e.target.value) })}
                  className="w-full accent-amber-500 h-1 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── SECCIÓN 6: TELAS Y TERCIOPELO (SHEEN) ── */}
        <div className="bg-zinc-900/40 rounded-xl border border-white/5 overflow-hidden">
          <button 
            onClick={() => toggleSection('sheen')}
            className="w-full p-2.5 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-300">
              <Feather size={13} className="text-rose-400" />
              <span>Telas & Terciopelo (Sheen)</span>
              {(activeMaterial.sheen ?? 0) > 0 && (
                <span className="text-[8px] bg-rose-500/20 text-rose-300 px-1 rounded border border-rose-500/30">
                  {((activeMaterial.sheen ?? 0) * 100).toFixed(0)}%
                </span>
              )}
            </div>
            {openSections.sheen ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
          </button>

          {openSections.sheen && (
            <div className="p-3 pt-1 space-y-3 border-t border-white/5">
              <p className="text-[9px] text-zinc-400 leading-tight">
                Genera retro-dispersión y suavidad de micro-vellosidades en los bordes de la tela o terciopelo.
              </p>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <label className="text-zinc-400">Intensidad Sheen (Terciopelo)</label>
                  <span className="font-mono text-rose-400 font-bold">{((activeMaterial.sheen ?? 0) * 100).toFixed(0)}%</span>
                </div>
                <input 
                  type="range" min="0" max="1" step="0.01"
                  value={activeMaterial.sheen ?? 0}
                  onChange={e => updateMaterial(activeMaterial.id, { sheen: parseFloat(e.target.value) })}
                  className="w-full accent-rose-500 h-1 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 items-end">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-400">Color de Sheen</label>
                  <div className="flex items-center gap-2 bg-white/5 p-1.5 h-8 rounded-lg border border-white/5">
                    <input 
                      type="color" 
                      value={activeMaterial.sheenColor || '#ffffff'}
                      onChange={e => updateMaterial(activeMaterial.id, { sheenColor: e.target.value })}
                      className="w-5 h-5 rounded bg-transparent border-none cursor-pointer"
                    />
                    <span className="text-[10px] font-mono uppercase text-zinc-300">{activeMaterial.sheenColor || '#ffffff'}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px]">
                    <label className="text-zinc-400">Rugosidad Sheen</label>
                    <span className="font-mono text-zinc-400">{(activeMaterial.sheenRoughness ?? 0.5).toFixed(2)}</span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.01"
                    value={activeMaterial.sheenRoughness ?? 0.5}
                    onChange={e => updateMaterial(activeMaterial.id, { sheenRoughness: parseFloat(e.target.value) })}
                    className="w-full accent-rose-500 h-1 bg-white/10 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── SECCIÓN 7: IRIDISCENCIA & PELÍCULA FINA ── */}
        <div className="bg-zinc-900/40 rounded-xl border border-white/5 overflow-hidden">
          <button 
            onClick={() => toggleSection('iridescence')}
            className="w-full p-2.5 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-300">
              <Gem size={13} className="text-fuchsia-400" />
              <span>Iridiscencia & Película Fina</span>
              {(activeMaterial.iridescence ?? 0) > 0 && (
                <span className="text-[8px] bg-fuchsia-500/20 text-fuchsia-300 px-1 rounded border border-fuchsia-500/30">
                  {((activeMaterial.iridescence ?? 0) * 100).toFixed(0)}%
                </span>
              )}
            </div>
            {openSections.iridescence ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
          </button>

          {openSections.iridescence && (
            <div className="p-3 pt-1 space-y-3 border-t border-white/5">
              <p className="text-[9px] text-zinc-400 leading-tight">
                Interferencia óptica de capa delgada que produce cambios de color iridiscentes según el ángulo de visión (pompas de jabón, manchas de aceite, nácar, alas de insectos).
              </p>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <label className="text-zinc-400">Intensidad Iridiscente</label>
                  <span className="font-mono text-fuchsia-400 font-bold">{((activeMaterial.iridescence ?? 0) * 100).toFixed(0)}%</span>
                </div>
                <input 
                  type="range" min="0" max="1" step="0.01"
                  value={activeMaterial.iridescence ?? 0}
                  onChange={e => updateMaterial(activeMaterial.id, { iridescence: parseFloat(e.target.value) })}
                  className="w-full accent-fuchsia-500 h-1 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <label className="text-zinc-400">IOR Película Iridiscente</label>
                  <span className="font-mono text-zinc-300">{(activeMaterial.iridescenceIOR ?? 1.3).toFixed(2)}</span>
                </div>
                <input 
                  type="range" min="1.0" max="3.0" step="0.05"
                  value={activeMaterial.iridescenceIOR ?? 1.3}
                  onChange={e => updateMaterial(activeMaterial.id, { iridescenceIOR: parseFloat(e.target.value) })}
                  className="w-full accent-fuchsia-500 h-1 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── SECCIÓN 8: EMISIÓN Y BRILLO (GLOW) ── */}
        <div className="bg-zinc-900/40 rounded-xl border border-white/5 overflow-hidden">
          <button 
            onClick={() => toggleSection('emissive')}
            className="w-full p-2.5 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-300">
              <Sun size={13} className="text-yellow-400" />
              <span>Emisión & Brillo (Glow)</span>
              {activeMaterial.emissive && activeMaterial.emissive !== '#000000' && (
                <span className="text-[8px] bg-yellow-500/20 text-yellow-300 px-1 rounded border border-yellow-500/30">ACTIVO</span>
              )}
            </div>
            {openSections.emissive ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
          </button>

          {openSections.emissive && (
            <div className="p-3 pt-1 space-y-3 border-t border-white/5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-zinc-400">Color de Emisión</label>
                <div className="flex items-center gap-2 bg-white/5 p-1 rounded border border-white/5">
                  <input 
                    type="color" 
                    value={activeMaterial.emissive || '#000000'}
                    onChange={e => updateMaterial(activeMaterial.id, { emissive: e.target.value })}
                    className="w-5 h-5 rounded bg-transparent border-none cursor-pointer"
                  />
                  <span className="text-[10px] font-mono uppercase text-zinc-300">{activeMaterial.emissive || '#000000'}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <label className="text-zinc-400">Intensidad Emisiva</label>
                  <span className="font-mono text-yellow-400 font-bold">{activeMaterial.emissiveIntensity ?? 1}</span>
                </div>
                <input 
                  type="range" min="0" max="20" step="0.1"
                  value={activeMaterial.emissiveIntensity ?? 1}
                  onChange={e => updateMaterial(activeMaterial.id, { emissiveIntensity: parseFloat(e.target.value) })}
                  className="w-full accent-yellow-500 h-1 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── SECCIÓN 9: FILTROS DE DESGASTE (ÓXIDO, ARAÑAZOS, SUCpipeline) ── */}
        <div className="bg-amber-950/20 rounded-xl border border-amber-500/20 overflow-hidden">
          <button 
            onClick={() => toggleSection('filters')}
            className="w-full p-2.5 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-amber-400">
              <Sparkles size={13} />
              <span>Imperfecciones & Desgaste (Filtros)</span>
            </div>
            {openSections.filters ? <ChevronDown size={14} className="text-amber-500" /> : <ChevronRight size={14} className="text-amber-500" />}
          </button>

          {openSections.filters && (
            <div className="p-3 pt-1 space-y-2.5 border-t border-amber-500/20">
              {/* Slider Óxido */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="flex items-center gap-1.5 text-zinc-300 font-medium">
                    <span>🦀</span> Óxido / Corrosión (Rust)
                  </span>
                  <span className="font-mono text-amber-400 font-bold">
                    {((activeMaterial.filters?.rust ?? 0) * 100).toFixed(0)}%
                  </span>
                </div>
                <input 
                  type="range" min="0" max="1" step="0.05"
                  value={activeMaterial.filters?.rust ?? 0}
                  onChange={e => handleFilterChange('rust', parseFloat(e.target.value))}
                  className="w-full accent-amber-500 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>

              {/* Slider Arañazos */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="flex items-center gap-1.5 text-zinc-300 font-medium">
                    <span>🔪</span> Arañazos / Incisiones (Scratches)
                  </span>
                  <span className="font-mono text-cyan-400 font-bold">
                    {((activeMaterial.filters?.scratches ?? 0) * 100).toFixed(0)}%
                  </span>
                </div>
                <input 
                  type="range" min="0" max="1" step="0.05"
                  value={activeMaterial.filters?.scratches ?? 0}
                  onChange={e => handleFilterChange('scratches', parseFloat(e.target.value))}
                  className="w-full accent-cyan-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>

              {/* Slider Suciedad / Grietas */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="flex items-center gap-1.5 text-zinc-300 font-medium">
                    <span>🟤</span> Suciedad / Grietas (Dirt)
                  </span>
                  <span className="font-mono text-yellow-500 font-bold">
                    {((activeMaterial.filters?.dirt ?? 0) * 100).toFixed(0)}%
                  </span>
                </div>
                <input 
                  type="range" min="0" max="1" step="0.05"
                  value={activeMaterial.filters?.dirt ?? 0}
                  onChange={e => handleFilterChange('dirt', parseFloat(e.target.value))}
                  className="w-full accent-yellow-500 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>

              {/* Presets Rápidos */}
              <div className="grid grid-cols-4 gap-1.5 pt-1.5 border-t border-amber-500/20">
                <button
                  onClick={() => {
                    handleFilterChange('rust', 0);
                    handleFilterChange('scratches', 0);
                    handleFilterChange('dirt', 0);
                  }}
                  className="py-1 px-1 bg-zinc-800 hover:bg-zinc-700 text-[9px] font-bold text-zinc-300 rounded text-center transition-colors truncate"
                >
                  Limpio
                </button>
                <button
                  onClick={() => {
                    handleFilterChange('rust', 0.15);
                    handleFilterChange('scratches', 0.2);
                    handleFilterChange('dirt', 0.15);
                  }}
                  className="py-1 px-1 bg-amber-900/40 hover:bg-amber-800/60 text-[9px] font-bold text-amber-300 rounded text-center transition-colors border border-amber-500/30 truncate"
                >
                  Uso Ligero
                </button>
                <button
                  onClick={() => {
                    handleFilterChange('rust', 0.45);
                    handleFilterChange('scratches', 0.5);
                    handleFilterChange('dirt', 0.4);
                  }}
                  className="py-1 px-1 bg-amber-900/60 hover:bg-amber-800/80 text-[9px] font-bold text-amber-200 rounded text-center transition-colors border border-amber-500/40 truncate"
                >
                  Desgastado
                </button>
                <button
                  onClick={() => {
                    handleFilterChange('rust', 0.85);
                    handleFilterChange('scratches', 0.8);
                    handleFilterChange('dirt', 0.75);
                  }}
                  className="py-1 px-1 bg-red-950/80 hover:bg-red-900/80 text-[9px] font-bold text-red-200 rounded text-center transition-colors border border-red-500/40 truncate"
                >
                  Extremo
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── SECCIÓN 10: MAPEO Y DESENVOLVIMIENTO UV (BLENDER STANDARD) ── */}
        <div className="bg-zinc-900/40 rounded-xl border border-white/5 overflow-hidden">
          <button 
            onClick={() => toggleSection('projection')}
            className="w-full p-2.5 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-indigo-400">
              <Box size={13} />
              <span>Mapeo & Desenvolvimiento UV (Blender)</span>
            </div>
            {openSections.projection ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
          </button>

          {openSections.projection && (
            <div className="p-3 pt-1 space-y-3 border-t border-white/5">
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: 'SMART_UV', label: 'Smart UV', icon: '🧠' },
                  { id: 'BOX', label: 'Cúbico (Box)', icon: '📦' },
                  { id: 'TRIPLANAR', label: 'Triplanar', icon: '💎' },
                  { id: 'LIGHTMAP', label: 'Lightmap', icon: '💡' },
                  { id: 'PLANAR', label: 'Plana', icon: '📐' },
                  { id: 'SPHERICAL', label: 'Esférica', icon: '🌐' },
                  { id: 'CYLINDRICAL', label: 'Cilíndrica', icon: '🛢️' },
                  { id: 'UV', label: 'Auto Normal', icon: '🗺️' },
                ].map(proj => {
                  const currentMapping = activeMaterial.uvwMapping || 'BOX';
                  const isSelected = currentMapping === proj.id || (proj.id === 'SMART_UV' && currentMapping === 'UV');
                  return (
                    <button
                      key={proj.id}
                      onClick={() => {
                        updateMaterial(activeMaterial.id, { uvwMapping: proj.id as any });
                        handleAutoUVProjection(proj.id);
                      }}
                      className={`px-1.5 py-1.5 rounded-lg text-[9px] font-bold flex flex-col items-center justify-center gap-0.5 transition-all border ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                          : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border-white/5'
                      }`}
                    >
                      <span className="text-[13px]">{proj.icon}</span>
                      <span className="truncate w-full text-center">{proj.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Controles de Smart UV Project (Ángulo límite, Margen de islas, Relajación contra estiramiento) */}
              {((activeMaterial.uvwMapping || 'BOX') === 'SMART_UV' || (activeMaterial.uvwMapping || 'BOX') === 'UV') && (
                <div className="space-y-2 bg-indigo-950/25 p-2.5 rounded-lg border border-indigo-500/25">
                  <div className="text-[9px] font-bold text-indigo-300 uppercase tracking-wider flex items-center justify-between">
                    <span>Parámetros Smart UV Project</span>
                    <span className="text-[8px] bg-indigo-500/20 text-indigo-200 px-1 py-0.5 rounded">Blender 5.x</span>
                  </div>

                  {/* Ángulo Límite */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[10px]">
                      <label className="text-zinc-400">Ángulo Límite (Angle Limit)</label>
                      <span className="font-mono text-indigo-400">{(activeMaterial.uvAngleThreshold ?? 66).toFixed(0)}°</span>
                    </div>
                    <input 
                      type="range" min="20" max="89" step="1"
                      value={activeMaterial.uvAngleThreshold ?? 66}
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        updateMaterial(activeMaterial.id, { uvAngleThreshold: val });
                      }}
                      onPointerUp={() => handleAutoUVProjection('SMART_UV')}
                      className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Margen entre islas */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[10px]">
                      <label className="text-zinc-400">Margen de Islas (Island Margin)</label>
                      <span className="font-mono text-indigo-400">{(activeMaterial.uvIslandMargin ?? 0.02).toFixed(3)}</span>
                    </div>
                    <input 
                      type="range" min="0.001" max="0.08" step="0.002"
                      value={activeMaterial.uvIslandMargin ?? 0.02}
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        updateMaterial(activeMaterial.id, { uvIslandMargin: val });
                      }}
                      onPointerUp={() => handleAutoUVProjection('SMART_UV')}
                      className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Pasos de Relajación Antiestiramiento */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[10px]">
                      <label className="text-zinc-400">Relajación Laplaciana (Min Stretch)</label>
                      <span className="font-mono text-indigo-400">{activeMaterial.uvRelaxIterations ?? 6} iter</span>
                    </div>
                    <input 
                      type="range" min="0" max="15" step="1"
                      value={activeMaterial.uvRelaxIterations ?? 6}
                      onChange={e => {
                        const val = parseInt(e.target.value, 10);
                        updateMaterial(activeMaterial.id, { uvRelaxIterations: val });
                      }}
                      onPointerUp={() => handleAutoUVProjection('SMART_UV')}
                      className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {((activeMaterial.uvwMapping || 'BOX') === 'TRIPLANAR' || (activeMaterial.uvwMapping || 'BOX') === 'BOX') && (
                <div className="space-y-1.5 bg-indigo-950/30 p-2 rounded-lg border border-indigo-500/30">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-zinc-200 font-bold flex items-center gap-1">
                      <Sparkles size={11} className="text-indigo-400" />
                      <span>Blend (Suavizado de bordes)</span>
                    </span>
                    <span className="font-mono text-indigo-400 font-bold">
                      {((activeMaterial.triplanarBlend ?? 0.5) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.01"
                    value={activeMaterial.triplanarBlend ?? 0.5}
                    onChange={e => updateMaterial(activeMaterial.id, { triplanarBlend: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg cursor-pointer"
                  />
                </div>
              )}

              <div className="pt-1 flex gap-2">
                <button
                  onClick={() => handleAutoUVProjection()}
                  className="flex-1 py-1.5 px-2 bg-indigo-600/20 hover:bg-indigo-600/35 text-indigo-300 hover:text-white border border-indigo-500/40 rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-98"
                >
                  <Zap size={12} className="text-indigo-400" />
                  <span>Desplegar / Recalcular UV</span>
                </button>
                <button
                  onClick={() => updateMaterial(activeMaterial.id, { uvDebug: !activeMaterial.uvDebug })}
                  className={`py-1.5 px-2 rounded-xl text-[10px] font-bold border transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-98 ${
                    activeMaterial.uvDebug 
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-indigo-600/30' 
                      : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border-white/10'
                  }`}
                  title="Activar/Desactivar textura Checkerboard UV para este material"
                >
                  <Grid size={12} />
                  <span>UV Debug: {activeMaterial.uvDebug ? 'ON' : 'OFF'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── SECCIÓN 11: MAPAS DE TEXTURAS & SLOTS EXPANDIDOS ── */}
        <div className="bg-zinc-900/40 rounded-xl border border-white/5 overflow-hidden">
          <button 
            onClick={() => toggleSection('maps')}
            className="w-full p-2.5 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-300">
              <Layers size={13} className="text-indigo-400" />
              <span>Mapas de Textura PBR (Slots)</span>
            </div>
            {openSections.maps ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
          </button>

          {openSections.maps && (
            <div className="p-3 pt-1 space-y-3 border-t border-white/5">
              {/* Toggles Compactados en el lateral superior */}
              <div className="flex items-center justify-between text-[9px] font-bold text-zinc-500 uppercase bg-black/20 p-2 rounded-lg border border-white/5">
                <div className="flex items-center gap-1.5">
                  <span>Flip Y (Texturas)</span>
                  <button 
                    onClick={() => updateMaterial(activeMaterial.id, { flipY: !(activeMaterial.flipY ?? true) })}
                    className={`w-7 h-3.5 rounded-full transition-colors relative ${activeMaterial.flipY ?? true ? 'bg-indigo-600' : 'bg-zinc-800'}`}
                  >
                    <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all ${activeMaterial.flipY ?? true ? 'left-4' : 'left-0.5'}`} />
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <span>Usar ORM Compuesto</span>
                  <button 
                    onClick={() => updateMaterial(activeMaterial.id, { useORM: !activeMaterial.useORM })}
                    className={`w-7 h-3.5 rounded-full transition-colors relative ${activeMaterial.useORM ? 'bg-indigo-600' : 'bg-zinc-800'}`}
                  >
                    <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all ${activeMaterial.useORM ? 'left-4' : 'left-0.5'}`} />
                  </button>
                </div>
              </div>

              {/* Tiling / Scale / Offset */}
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] text-zinc-500 truncate" title="Repetición (Scale)">Repetición</span>
                  <div className="flex items-center gap-1 bg-black/20 px-1.5 py-1 h-7 rounded border border-white/5">
                    <span className="text-[9px] text-zinc-600">U</span>
                    <input 
                      type="number" step="0.1"
                      value={activeMaterial.mapRepeat?.[0] ?? 1}
                      onChange={e => updateMaterial(activeMaterial.id, { mapRepeat: [parseFloat(e.target.value) || 1, activeMaterial.mapRepeat?.[1] ?? 1] })}
                      className="w-full bg-transparent text-[11px] text-white text-right outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[9px] text-zinc-500 truncate" title="Desplazamiento (Offset)">Desplazamiento</span>
                  <div className="flex items-center gap-1 bg-black/20 px-1.5 py-1 h-7 rounded border border-white/5">
                    <span className="text-[9px] text-zinc-600">U</span>
                    <input 
                      type="number" step="0.05"
                      value={activeMaterial.mapOffset?.[0] ?? 0}
                      onChange={e => updateMaterial(activeMaterial.id, { mapOffset: [parseFloat(e.target.value) || 0, activeMaterial.mapOffset?.[1] ?? 0] })}
                      className="w-full bg-transparent text-[11px] text-white text-right outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[9px] text-zinc-500 truncate" title="Rotación (Grados)">Rotación</span>
                  <div className="flex items-center gap-1 bg-black/20 px-1.5 py-1 h-7 rounded border border-white/5">
                    <input 
                      type="number" step="5"
                      value={activeMaterial.mapRotation ?? 0}
                      onChange={e => updateMaterial(activeMaterial.id, { mapRotation: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-transparent text-[11px] text-white text-right outline-none font-mono"
                    />
                    <span className="text-[9px] text-zinc-600">°</span>
                  </div>
                </div>
              </div>

              {activeMaterial.useORM && (activeMaterial.aoMap || activeMaterial.roughnessMap || activeMaterial.metalnessMap) && (
                <button 
                  onClick={() => useStore.getState().generateORM(activeMaterial.id)}
                  className="w-full py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 text-[10px] font-bold rounded border border-indigo-500/30 transition-colors"
                >
                  GENERAR MAPA COMPUESTO ORM
                </button>
              )}

              {/* Ranuras de imágenes PBR */}
              <div className="grid grid-cols-2 gap-2.5">
                <TextureSlot 
                  label="Albedo / Base Color" 
                  texture={activeMaterial.map} 
                  onDrop={e => onDropTexture(e, 'map')}
                  onClear={() => updateMaterial(activeMaterial.id, { map: undefined })}
                />
                <TextureSlot 
                  label={`Normal Map (${activeMaterial.normalFormat === 'DIRECTX' ? 'DirectX' : 'OpenGL'})`}
                  texture={activeMaterial.normalMap} 
                  onDrop={e => onDropTexture(e, 'normalMap')}
                  onClear={() => updateMaterial(activeMaterial.id, { normalMap: undefined })}
                />

                {activeMaterial.useORM ? (
                  <div className="col-span-2 space-y-2">
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
                    <TextureSlot 
                      label="Displacement / Height" 
                      texture={activeMaterial.displacementMap} 
                      onDrop={e => onDropTexture(e, 'displacementMap')}
                      onClear={() => updateMaterial(activeMaterial.id, { displacementMap: undefined })}
                    />
                  </>
                )}

                <TextureSlot 
                  label="Emissive Map" 
                  texture={activeMaterial.emissiveMap} 
                  onDrop={e => onDropTexture(e, 'emissiveMap')}
                  onClear={() => updateMaterial(activeMaterial.id, { emissiveMap: undefined })}
                />
                <TextureSlot 
                  label="Alpha / Opacidad" 
                  texture={activeMaterial.alphaMap} 
                  onDrop={e => onDropTexture(e, 'alphaMap')}
                  onClear={() => updateMaterial(activeMaterial.id, { alphaMap: undefined })}
                />
                <TextureSlot 
                  label="Transmission Map" 
                  texture={activeMaterial.transmissionMap} 
                  onDrop={e => onDropTexture(e, 'transmissionMap')}
                  onClear={() => updateMaterial(activeMaterial.id, { transmissionMap: undefined })}
                />
                <TextureSlot 
                  label="Anisotropy Map" 
                  texture={activeMaterial.anisotropyMap} 
                  onDrop={e => onDropTexture(e, 'anisotropyMap')}
                  onClear={() => updateMaterial(activeMaterial.id, { anisotropyMap: undefined })}
                />
              </div>
            </div>
          )}
        </div>
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
      <label className="text-[9px] text-zinc-500 font-bold uppercase tracking-tighter truncate block" title={label}>{label}</label>
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
