import * as THREE from 'three';
import { VolumetricConfig } from '../types';

export const DEFAULT_VOLUMETRIC_CONFIG: Required<VolumetricConfig> = {
  enabled: true,
  density: 1.5,
  scale: 2.0,
  lightIntensity: 1.2,
  color: '#ffffff',
  threshold: 0.4,
  thresholdMax: 0.8,
  absorption: 2.0,
  steps: 32,
  shadowSteps: 6,
  windSpeed: 0.1,
  windDirection: [0.0, 1.0, 0.0],
};

// 1. Vertex Shader (Passes local and world positions for bounding-box raymarching)
export const volumetricVertexShader = `
  varying vec3 vLocalPosition;
  varying vec3 vWorldPosition;

  void main() {
    vLocalPosition = position; // Local position in Box container [-0.5, 0.5]
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// 2. Fragment Shader (Volumetric Raymarching with 3D FBM Noise and Beer-Lambert Light Transmittance)
export const volumetricFragmentShader = `
  uniform mat4 uModelInverse;
  varying vec3 vLocalPosition;
  varying vec3 vWorldPosition;

  uniform float uTime;
  uniform float uCloudDensity;
  uniform float uLightIntensity;
  uniform float uCloudScale;
  uniform vec3 uCloudColor;
  uniform vec3 uLightPosition;
  uniform float uThreshold;
  uniform float uThresholdMax;
  uniform float uAbsorption;
  uniform int uSteps;
  uniform int uShadowSteps;
  uniform vec3 uWind;

  uniform vec3 cameraPosition;

  // --- 3D Analytic Noise ---
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.1, 0.1));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(in vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(
        mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x),
        f.y
      ),
      mix(
        mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x),
        f.y
      ),
      f.z
    );
  }

  // --- Fractal Brownian Motion (FBM) with 4 Octaves ---
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    vec3 shift = vec3(100.0);
    for (int i = 0; i < 4; ++i) {
      v += a * noise(p);
      p = p * 2.02 + shift;
      a *= 0.5;
    }
    return v;
  }

  // --- Internal Light Transmittance & Beer-Lambert Law Calculation ---
  float getLightTransmittance(vec3 pos, vec3 lightDir) {
    float shadowDensity = 0.0;
    float shadowStepLength = 0.05;
    vec3 shadowStep = lightDir * shadowStepLength;
    vec3 currentPos = pos;

    for (int j = 0; j < 8; j++) {
      if (j >= uShadowSteps) break;
      currentPos += shadowStep;
      
      // Fade out light ray
      vec3 lightLocalPos = (uModelInverse * vec4(currentPos, 1.0)).xyz;
      if (length(lightLocalPos) > 1.5) {
        break;
      }
      
      vec3 sampleCoord = (currentPos * uCloudScale) + (uWind * uTime);
      float d = fbm(sampleCoord);
      shadowDensity += smoothstep(uThreshold, uThresholdMax, d) * uCloudDensity * shadowStepLength;
    }
    return exp(-shadowDensity * uAbsorption); // Beer-Lambert exponential shadow attenuation
  }

  void main() {
    // Eye ray from camera through the box pixel
    vec3 rayDirection = normalize(vWorldPosition - cameraPosition);
    vec3 lightDirection = normalize(uLightPosition - vWorldPosition);
    vec3 currentWorldPos = vWorldPosition;
    
    float accumDensity = 0.0;
    vec3 accumColor = vec3(0.0);
    
    // Adaptive step length based on step count (scaled by bounds)
    float stepLength = 3.0 / float(max(uSteps, 16));
    vec3 stepVector = rayDirection * stepLength;

    for (int i = 0; i < 64; i++) {
      if (i >= uSteps) break;

      vec3 localPos = (uModelInverse * vec4(currentWorldPos, 1.0)).xyz;
      // Fade out instead of hard clipping bounds
      float dist = length(localPos);
      if (dist > 1.5) {
        break; // Far outside
      }

      // Sample 3D volumetric noise animated over time
      vec3 sampleCoord = (localPos * uCloudScale) + (uWind * uTime);
      float d = fbm(sampleCoord);
      
      // Soft spherical falloff mask to remove hard cube edges (fits inside 1x1x1 box bounds)
      float edgeMask = smoothstep(0.7, 0.4, length(localPos));
      d *= edgeMask;

      // Thresholding to sculpt volumetric cavities and wispy edges
      d = smoothstep(uThreshold, uThresholdMax, d) * uCloudDensity;

      if (d > 0.005) {
        // Beer-Lambert transmittance
        float transmittance = exp(-accumDensity);
        
        // Internal self-shadowing & light absorption
        float lightAbsorption = getLightTransmittance(currentLocalPos, lightDirection);
        
        accumDensity += d * stepLength;
        
        // Ambient base + Direct diffuse light
        float ambientFactor = 0.25;
        float diffuseFactor = max(lightAbsorption, 0.05);
        vec3 litColor = uCloudColor * (uLightIntensity * (ambientFactor + diffuseFactor * 0.75));
        
        accumColor += transmittance * d * litColor * stepLength;
      }

      // Early exit when gas becomes fully opaque
      if (accumDensity >= 0.98) {
        accumDensity = 1.0;
        break;
      }

      currentWorldPos += stepVector;
    }

    if (accumDensity <= 0.001) {
      discard;
    }

    gl_FragColor = vec4(accumColor, clamp(accumDensity, 0.0, 1.0));
  }
`;

/**
 * Creates a THREE.ShaderMaterial configured for Volumetric Raymarching
 */
export function createRaymarchedCloudMaterial(config?: Partial<VolumetricConfig>): THREE.ShaderMaterial {
  const cfg = { ...DEFAULT_VOLUMETRIC_CONFIG, ...(config || {}) };

  const uniforms = {
    uTime: { value: 0 },
    uCloudDensity: { value: cfg.density },
    uLightIntensity: { value: cfg.lightIntensity },
    uCloudScale: { value: cfg.scale },
    uCloudColor: { value: new THREE.Color(cfg.color) },
    uLightPosition: { value: new THREE.Vector3(5, 10, 5) },
    uThreshold: { value: cfg.threshold },
    uThresholdMax: { value: cfg.thresholdMax ?? 0.8 },
    uAbsorption: { value: cfg.absorption },
    uSteps: { value: cfg.steps },
    uShadowSteps: { value: cfg.shadowSteps },
    uModelInverse: { value: new THREE.Matrix4() },
    uWind: {
      value: new THREE.Vector3(
        cfg.windDirection[0] * cfg.windSpeed,
        cfg.windDirection[1] * cfg.windSpeed,
        cfg.windDirection[2] * cfg.windSpeed
      ),
    },
  };

  const mat = new THREE.ShaderMaterial({
    vertexShader: volumetricVertexShader,
    fragmentShader: volumetricFragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false, // Prevents depth occlusion artifacts with other objects
    side: THREE.DoubleSide, // Allows viewing the cloud even if camera goes inside
  });

  mat.userData.isVolumetric = true;
  mat.userData.volumetricConfig = cfg;

  return mat;
}

/**
 * Updates uniforms for a volumetric material on every frame
 */
export function updateVolumetricUniforms(
  material: THREE.ShaderMaterial,
  config: Partial<VolumetricConfig>,
  time: number,
  lightPosition?: THREE.Vector3,
  mesh?: THREE.Mesh
) {
  if (!material || !material.uniforms) return;

  const u = material.uniforms;
  if (u.uTime) u.uTime.value = time;
  if (u.uModelInverse && mesh) {
    u.uModelInverse.value.copy(mesh.matrixWorld).invert();
  }
  if (u.uLightPosition && lightPosition) {
    u.uLightPosition.value.copy(lightPosition);
  }

  if (config.density !== undefined && u.uCloudDensity) {
    u.uCloudDensity.value = config.density;
  }
  if (config.scale !== undefined && u.uCloudScale) {
    u.uCloudScale.value = config.scale;
  }
  if (config.lightIntensity !== undefined && u.uLightIntensity) {
    u.uLightIntensity.value = config.lightIntensity;
  }
  if (config.color && u.uCloudColor) {
    u.uCloudColor.value.set(config.color);
  }
  if (config.threshold !== undefined && u.uThreshold) {
    u.uThreshold.value = config.threshold;
  }
  if (config.thresholdMax !== undefined && u.uThresholdMax) {
    u.uThresholdMax.value = config.thresholdMax;
  }
  if (config.absorption !== undefined && u.uAbsorption) {
    u.uAbsorption.value = config.absorption;
  }
  if (config.steps !== undefined && u.uSteps) {
    u.uSteps.value = config.steps;
  }
  if (config.shadowSteps !== undefined && u.uShadowSteps) {
    u.uShadowSteps.value = config.shadowSteps;
  }
  if (u.uWind && config.windDirection && config.windSpeed !== undefined) {
    u.uWind.value.set(
      config.windDirection[0] * config.windSpeed,
      config.windDirection[1] * config.windSpeed,
      config.windDirection[2] * config.windSpeed
    );
  }
}

export interface VolumetricPreset {
  id: string;
  name: string;
  desc: string;
  icon: string;
  color: string;
  config: VolumetricConfig;
}

export const VOLUMETRIC_PRESETS: VolumetricPreset[] = [
  {
    id: 'cumulus',
    name: 'Cúmulo Suave',
    desc: 'Nube algodonosa blanca con sombras suaves',
    icon: '☁️',
    color: '#ffffff',
    config: {
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
    },
  },
  {
    id: 'storm',
    name: 'Nube de Tormenta',
    desc: 'Nube densa y oscura cargada de electricidad',
    icon: '⛈️',
    color: '#475569',
    config: {
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
    },
  },
  {
    id: 'smoke',
    name: 'Humo Denso',
    desc: 'Humo industrial grisáceo con alta dispersión',
    icon: '💨',
    color: '#334155',
    config: {
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
    },
  },
  {
    id: 'nebula',
    name: 'Nebulosa Cósmica',
    desc: 'Gas estelar brillante con tonalidades magenta y cian',
    icon: '🌌',
    color: '#c084fc',
    config: {
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
    },
  },
  {
    id: 'fire_gas',
    name: 'Gas Ígneo / Fuego',
    desc: 'Gas ardiente con tonos cálidos y alta luminosidad',
    icon: '🔥',
    color: '#f97316',
    config: {
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
    },
  },
  {
    id: 'aurora',
    name: 'Aurora Volumétrica',
    desc: 'Velo etéreo con brillo esmeralda suave',
    icon: '✨',
    color: '#34d399',
    config: {
      enabled: true,
      density: 1.2,
      scale: 1.8,
      lightIntensity: 1.5,
      color: '#34d399',
      threshold: 0.44,
      thresholdMax: 0.88,
      absorption: 1.0,
      steps: 32,
      shadowSteps: 5,
      windSpeed: 0.06,
      windDirection: [0.1, 0.0, 0.1],
    },
  },
];
