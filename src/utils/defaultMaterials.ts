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
    }
  ];
}
