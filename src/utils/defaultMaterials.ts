import { MaterialData } from '../types';
import { createNoiseTexture, createCheckerTexture, createWoodTexture } from './proceduralTextures';

export function getDefaultMaterials(): MaterialData[] {
  const noiseBump = createNoiseTexture(512, 512, 20, 0.3, true);
  const noiseRoughness = createNoiseTexture(512, 512, 10, 0.5, false);
  const woodDiffuse = createWoodTexture(512, 512, '#8b5a2b', '#5c3a21');
  const woodBump = createWoodTexture(512, 512, '#808080', '#404040'); // Grayscale for bump
  const checkerDiffuse = createCheckerTexture(512, 512, 8, '#ffffff', '#000000');

  return [
    { 
      id: 'm_gold', name: 'Oro', color: '#ffd700', 
      roughness: 0.1, roughnessMap: noiseRoughness, 
      metalness: 1.0, 
      normalMap: noiseBump, normalScale: 0.1,
      emissive: '#000000', emissiveIntensity: 1, opacity: 1, transparent: false, ior: 1.5, transmission: 0, thickness: 0 
    },
    { 
      id: 'm_copper', name: 'Cobre', color: '#b87333', 
      roughness: 0.2, roughnessMap: noiseRoughness, 
      metalness: 1.0, 
      normalMap: noiseBump, normalScale: 0.15,
      emissive: '#000000', emissiveIntensity: 1, opacity: 1, transparent: false, ior: 1.5, transmission: 0, thickness: 0 
    },
    { 
      id: 'm_silver', name: 'Plata / Cromo', color: '#c0c0c0', 
      roughness: 0.05, roughnessMap: noiseRoughness, 
      metalness: 1.0, 
      normalMap: noiseBump, normalScale: 0.05,
      emissive: '#000000', emissiveIntensity: 1, opacity: 1, transparent: false, ior: 1.5, transmission: 0, thickness: 0 
    },
    { 
      id: 'm_iron', name: 'Hierro', color: '#434b4d', 
      roughness: 0.6, roughnessMap: noiseRoughness, 
      metalness: 1.0, 
      normalMap: noiseBump, normalScale: 0.5,
      emissive: '#000000', emissiveIntensity: 1, opacity: 1, transparent: false, ior: 1.5, transmission: 0, thickness: 0 
    },
    { 
      id: 'r_stone', name: 'Piedra', color: '#888c8d', 
      roughness: 0.9, roughnessMap: noiseRoughness, 
      metalness: 0.0, 
      normalMap: noiseBump, normalScale: 1.0,
      emissive: '#000000', emissiveIntensity: 1, opacity: 1, transparent: false, ior: 1.5, transmission: 0, thickness: 0 
    },
    { 
      id: 'r_marble', name: 'Mármol', color: '#e3e3e3', 
      roughness: 0.1, roughnessMap: noiseRoughness, 
      metalness: 0.0, 
      normalMap: noiseBump, normalScale: 0.05,
      emissive: '#000000', emissiveIntensity: 1, opacity: 1, transparent: false, ior: 1.5, transmission: 0, thickness: 0 
    },
    { 
      id: 'g_clear', name: 'Cristal Claro', color: '#ffffff', 
      roughness: 0.0, 
      metalness: 0.0, 
      emissive: '#000000', emissiveIntensity: 1, opacity: 1, transparent: true, ior: 1.5, transmission: 1.0, thickness: 0.5 
    },
    { 
      id: 'g_frosted', name: 'Cristal Esmerilado', color: '#ffffff', 
      roughness: 0.4, roughnessMap: noiseRoughness, 
      metalness: 0.0, 
      normalMap: noiseBump, normalScale: 0.2,
      emissive: '#000000', emissiveIntensity: 1, opacity: 1, transparent: true, ior: 1.5, transmission: 0.9, thickness: 0.5 
    },
    { 
      id: 'p_glossy', name: 'Plástico Brillante', color: '#e74c3c', 
      roughness: 0.1, 
      metalness: 0.0, 
      emissive: '#000000', emissiveIntensity: 1, opacity: 1, transparent: false, ior: 1.5, transmission: 0, thickness: 0 
    },
    { 
      id: 'p_matte', name: 'Plástico Mate', color: '#3498db', 
      roughness: 0.6, roughnessMap: noiseRoughness, 
      metalness: 0.0, 
      normalMap: noiseBump, normalScale: 0.1,
      emissive: '#000000', emissiveIntensity: 1, opacity: 1, transparent: false, ior: 1.5, transmission: 0, thickness: 0 
    },
    { 
      id: 'w_oak', name: 'Roble', color: '#ffffff', 
      map: woodDiffuse,
      roughness: 0.7, roughnessMap: woodBump, 
      metalness: 0.0, 
      normalMap: woodBump, normalScale: 0.3,
      emissive: '#000000', emissiveIntensity: 1, opacity: 1, transparent: false, ior: 1.5, transmission: 0, thickness: 0 
    },
    { 
      id: 'checker', name: 'Ajedrez', color: '#ffffff', 
      map: checkerDiffuse,
      roughness: 0.5, 
      metalness: 0.0, 
      emissive: '#000000', emissiveIntensity: 1, opacity: 1, transparent: false, ior: 1.5, transmission: 0, thickness: 0 
    },
    // ── Emisores ─────────────────────────────────────────────────────────────
    {
      id: 'e_neon_pink', name: 'Neón Rosa', color: '#ff006e',
      roughness: 0.0, metalness: 0.0,
      emissive: '#ff006e', emissiveIntensity: 4,
      opacity: 1, transparent: false, ior: 1.5, transmission: 0, thickness: 0,
    },
    {
      id: 'e_neon_cyan', name: 'Neón Cian', color: '#00f5ff',
      roughness: 0.0, metalness: 0.0,
      emissive: '#00f5ff', emissiveIntensity: 4,
      opacity: 1, transparent: false, ior: 1.5, transmission: 0, thickness: 0,
    },
    {
      id: 'e_neon_green', name: 'Neón Verde', color: '#00ff41',
      roughness: 0.0, metalness: 0.0,
      emissive: '#00ff41', emissiveIntensity: 4,
      opacity: 1, transparent: false, ior: 1.5, transmission: 0, thickness: 0,
    },
    {
      id: 'e_neon_violet', name: 'Neón Violeta', color: '#bf5fff',
      roughness: 0.0, metalness: 0.0,
      emissive: '#bf5fff', emissiveIntensity: 4,
      opacity: 1, transparent: false, ior: 1.5, transmission: 0, thickness: 0,
    },
    {
      id: 'e_neon_orange', name: 'Neón Naranja', color: '#ff6500',
      roughness: 0.0, metalness: 0.0,
      emissive: '#ff6500', emissiveIntensity: 4,
      opacity: 1, transparent: false, ior: 1.5, transmission: 0, thickness: 0,
    },
    {
      id: 'e_laser_red', name: 'Láser Rojo', color: '#ff0000',
      roughness: 0.0, metalness: 0.5,
      emissive: '#ff0000', emissiveIntensity: 8,
      opacity: 1, transparent: false, ior: 1.5, transmission: 0, thickness: 0,
    },
    {
      id: 'e_laser_green', name: 'Láser Verde', color: '#00ff00',
      roughness: 0.0, metalness: 0.5,
      emissive: '#00ff00', emissiveIntensity: 8,
      opacity: 1, transparent: false, ior: 1.5, transmission: 0, thickness: 0,
    },
    {
      id: 'e_laser_blue', name: 'Láser Azul', color: '#0080ff',
      roughness: 0.0, metalness: 0.5,
      emissive: '#0080ff', emissiveIntensity: 8,
      opacity: 1, transparent: false, ior: 1.5, transmission: 0, thickness: 0,
    },
    {
      id: 'e_hologram', name: 'Holograma', color: '#00d4ff',
      roughness: 0.0, metalness: 0.0,
      emissive: '#00d4ff', emissiveIntensity: 2.5,
      opacity: 0.55, transparent: true, ior: 1.4, transmission: 0.3, thickness: 0.5,
    },
    {
      id: 'e_lava', name: 'Lava', color: '#ff4400',
      roughness: 0.9, metalness: 0.0,
      emissive: '#ff2200', emissiveIntensity: 2,
      normalMap: noiseBump, normalScale: 1.2,
      opacity: 1, transparent: false, ior: 1.5, transmission: 0, thickness: 0,
    },
    {
      id: 'e_sun', name: 'Sol / Plasma', color: '#ffdd00',
      roughness: 0.2, metalness: 0.0,
      emissive: '#ff8800', emissiveIntensity: 5,
      opacity: 1, transparent: false, ior: 1.5, transmission: 0, thickness: 0,
    },
    {
      id: 'e_led_white', name: 'LED Blanco', color: '#ffffff',
      roughness: 0.0, metalness: 0.0,
      emissive: '#ffffff', emissiveIntensity: 6,
      opacity: 1, transparent: false, ior: 1.5, transmission: 0, thickness: 0,
    },
    {
      id: 'e_ember', name: 'Brasa', color: '#ff3300',
      roughness: 0.95, metalness: 0.0,
      emissive: '#dd1100', emissiveIntensity: 1.5,
      normalMap: noiseBump, normalScale: 0.8,
      opacity: 1, transparent: false, ior: 1.5, transmission: 0, thickness: 0,
    },
    {
      id: 'p_car_paint', name: 'Pintura de Coche', color: '#ff0000',
      roughness: 0.2, metalness: 0.5,
      clearcoat: 1.0, clearcoatRoughness: 0.03,
      emissive: '#000000', emissiveIntensity: 0, opacity: 1, transparent: false, ior: 1.5, transmission: 0, thickness: 0,
    },
    {
      id: 'p_velvet', name: 'Terciopelo', color: '#4a0e0e',
      roughness: 0.9, metalness: 0.0,
      sheen: 1.0, sheenRoughness: 0.5, sheenColor: '#ff9999',
      emissive: '#000000', emissiveIntensity: 0, opacity: 1, transparent: false, ior: 1.5, transmission: 0, thickness: 0,
    },
    {
      id: 'g_diamond', name: 'Diamante', color: '#ffffff',
      roughness: 0.0, metalness: 0.0,
      transmission: 1.0, ior: 2.417, thickness: 1.0,
      emissive: '#000000', emissiveIntensity: 0, opacity: 1, transparent: true,
    },
    {
      id: 'm_anodized', name: 'Aluminio Anodizado', color: '#3498db',
      roughness: 0.2, metalness: 1.0,
      specularIntensity: 0.5,
      emissive: '#000000', emissiveIntensity: 0, opacity: 1, transparent: false, ior: 1.5,
    },
    // ── Adobe Substance 3D Collection ──────────────────────────────────────────
    {
      id: 'sub_damascus', name: 'Acero Damasco (Substance)', color: '#cbd5e1',
      roughness: 0.22, metalness: 1.0, normalMap: noiseBump, normalScale: 1.8,
      anisotropy: 0.75, anisotropyRotation: 45,
      emissive: '#000000', emissiveIntensity: 0, opacity: 1, transparent: false, ior: 1.5,
    },
    {
      id: 'sub_bronze_patina', name: 'Bronce Pátina (Substance)', color: '#a87343',
      roughness: 0.45, metalness: 0.75, normalMap: noiseBump, normalScale: 2.2,
      emissive: '#000000', emissiveIntensity: 0, opacity: 1, transparent: false, ior: 1.5,
    },
    {
      id: 'sub_shou_sugi_ban', name: 'Shou Sugi Ban Quemado (Substance)', color: '#18181b',
      roughness: 0.78, metalness: 0.12, normalMap: noiseBump, normalScale: 3.5,
      emissive: '#000000', emissiveIntensity: 0, opacity: 1, transparent: false, ior: 1.5,
    },
    {
      id: 'sub_teak_deck', name: 'Teca Marina Cubierta (Substance)', color: '#b45309',
      roughness: 0.38, metalness: 0.0, normalMap: noiseBump, normalScale: 1.5,
      emissive: '#000000', emissiveIntensity: 0, opacity: 1, transparent: false, ior: 1.5,
    },
    {
      id: 'sub_formwork_concrete', name: 'Hormigón Encofrado (Substance)', color: '#94a3b8',
      roughness: 0.75, metalness: 0.0, normalMap: noiseBump, normalScale: 2.0,
      emissive: '#000000', emissiveIntensity: 0, opacity: 1, transparent: false, ior: 1.5,
    },
    {
      id: 'sub_terrazzo', name: 'Terrazo Veneciano (Substance)', color: '#f8fafc',
      roughness: 0.15, metalness: 0.0, clearcoat: 0.85, clearcoatRoughness: 0.05,
      emissive: '#000000', emissiveIntensity: 0, opacity: 1, transparent: false, ior: 1.5,
    },
    {
      id: 'sub_calacatta_gold', name: 'Mármol Calacatta Gold (Substance)', color: '#ffffff',
      roughness: 0.08, metalness: 0.0, clearcoat: 0.9, clearcoatRoughness: 0.04,
      emissive: '#000000', emissiveIntensity: 0, opacity: 1, transparent: false, ior: 1.5,
    },
    {
      id: 'sub_distressed_leather', name: 'Cuero Vintage Envejecido (Substance)', color: '#9a3412',
      roughness: 0.58, metalness: 0.0, sheen: 0.6, sheenRoughness: 0.4, sheenColor: '#d97706',
      emissive: '#000000', emissiveIntensity: 0, opacity: 1, transparent: false, ior: 1.5,
    },
    {
      id: 'sub_kintsugi', name: 'Kintsugi Cerámica Oro (Substance)', color: '#27272a',
      roughness: 0.35, metalness: 0.3, clearcoat: 0.6, normalMap: noiseBump, normalScale: 3.0,
      emissive: '#000000', emissiveIntensity: 0, opacity: 1, transparent: false, ior: 1.5,
    },
    {
      id: 'sub_zellige', name: 'Azulejos Zellige Esmaltados (Substance)', color: '#0d9488',
      roughness: 0.06, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.03,
      emissive: '#000000', emissiveIntensity: 0, opacity: 1, transparent: false, ior: 1.5,
    },
    {
      id: 'sub_tactical_polymer', name: 'Polímero Táctico (Substance)', color: '#27272a',
      roughness: 0.72, metalness: 0.0, normalMap: noiseBump, normalScale: 2.8,
      emissive: '#000000', emissiveIntensity: 0, opacity: 1, transparent: false, ior: 1.5,
    },
    {
      id: 'sub_magma_crust', name: 'Corteza Magma Activa (Substance)', color: '#18181b',
      roughness: 0.9, metalness: 0.0, emissive: '#ff3b00', emissiveIntensity: 3.5,
      normalMap: noiseBump, normalScale: 4.5, opacity: 1, transparent: false, ior: 1.5,
    },
    // ── Volumétricos Raymarching ───────────────────────────────────────────────
    {
      id: 'vol_cumulus', name: 'Nube Cúmulo (Raymarching)', color: '#ffffff',
      roughness: 1.0, metalness: 0.0,
      emissive: '#000000', emissiveIntensity: 0,
      opacity: 1, transparent: true,
      isVolumetric: true,
      volumetric: {
        enabled: true,
        density: 1.6,
        scale: 2.2,
        lightIntensity: 1.2,
        color: '#ffffff',
        threshold: 0.38,
        thresholdMax: 0.82,
        absorption: 2.2,
        steps: 32,
        shadowSteps: 6,
        windSpeed: 0.08,
        windDirection: [0.1, 0.05, 0.0],
      }
    },
    {
      id: 'vol_storm', name: 'Nube de Tormenta 3D', color: '#475569',
      roughness: 1.0, metalness: 0.0,
      emissive: '#000000', emissiveIntensity: 0,
      opacity: 1, transparent: true,
      isVolumetric: true,
      volumetric: {
        enabled: true,
        density: 3.2,
        scale: 2.8,
        lightIntensity: 0.9,
        color: '#64748b',
        threshold: 0.32,
        thresholdMax: 0.78,
        absorption: 3.5,
        steps: 40,
        shadowSteps: 8,
        windSpeed: 0.18,
        windDirection: [0.2, 0.1, 0.0],
      }
    },
    {
      id: 'vol_nebula', name: 'Nebulosa Cósmica 3D', color: '#c084fc',
      roughness: 1.0, metalness: 0.0,
      emissive: '#000000', emissiveIntensity: 0,
      opacity: 1, transparent: true,
      isVolumetric: true,
      volumetric: {
        enabled: true,
        density: 1.8,
        scale: 1.6,
        lightIntensity: 1.6,
        color: '#c084fc',
        threshold: 0.35,
        thresholdMax: 0.80,
        absorption: 1.2,
        steps: 36,
        shadowSteps: 6,
        windSpeed: 0.04,
        windDirection: [0.05, 0.02, 0.08],
      }
    },
    {
      id: 'vol_smoke', name: 'Humo Denso 3D', color: '#334155',
      roughness: 1.0, metalness: 0.0,
      emissive: '#000000', emissiveIntensity: 0,
      opacity: 1, transparent: true,
      isVolumetric: true,
      volumetric: {
        enabled: true,
        density: 2.4,
        scale: 3.5,
        lightIntensity: 0.8,
        color: '#475569',
        threshold: 0.42,
        thresholdMax: 0.85,
        absorption: 3.0,
        steps: 32,
        shadowSteps: 6,
        windSpeed: 0.25,
        windDirection: [0.0, 1.0, 0.0],
      }
    },
    {
      id: 'vol_fire', name: 'Gas Ígneo / Fuego 3D', color: '#f97316',
      roughness: 1.0, metalness: 0.0,
      emissive: '#000000', emissiveIntensity: 0,
      opacity: 1, transparent: true,
      isVolumetric: true,
      volumetric: {
        enabled: true,
        density: 2.0,
        scale: 2.6,
        lightIntensity: 2.0,
        color: '#fb923c',
        threshold: 0.36,
        thresholdMax: 0.82,
        absorption: 1.5,
        steps: 32,
        shadowSteps: 6,
        windSpeed: 0.3,
        windDirection: [0.0, 1.0, 0.0],
      }
    }
  ];
}
