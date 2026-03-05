import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      // CRÍTICO: dedupe fuerza una sola instancia de Three.js en todo el proyecto.
      // Sin esto, three-bvh-csg y three-csg-ts cargan su propia copia de Three.js,
      // causando el error "not an instance of THREE.Object3D" en TransformControls.
      dedupe: ['three'],
      alias: {
        '@': path.resolve(__dirname, '.'),
        'three': path.resolve(__dirname, 'node_modules/three'),
      },
    },
    optimizeDeps: {
      include: ['three'],
      exclude: ['three-bvh-csg', 'three-csg-ts', 'three-mesh-bvh'],
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});