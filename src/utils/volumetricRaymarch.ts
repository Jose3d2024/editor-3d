import * as THREE from 'three';
import { VolumetricConfig, VolumetricMode } from '../types';

export const DEFAULT_VOLUMETRIC_CONFIG: Required<VolumetricConfig> = {
  enabled: true,
  mode: 'cloud',
  density: 2.4,
  scale: 2.2,
  lightIntensity: 1.5,
  color: '#ffffff',
  secondaryColor: '#f59e0b',
  emissiveIntensity: 1.5,
  threshold: 0.22,
  thresholdMax: 0.75,
  absorption: 1.6,
  steps: 36,
  shadowSteps: 4,
  windSpeed: 0.12,
  windDirection: [0.0, 1.0, 0.0],
  blending: 'normal',
  turbulentFlame: false,
};

// 1. Vertex Shader (Passes local and world positions for bounding-box raymarching)
export const volumetricVertexShader = `
  varying vec3 vLocalPosition;
  varying vec3 vWorldPosition;

  void main() {
    vLocalPosition = position; // Local position in container [-0.5, 0.5] or mesh space
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// 2. Fragment Shader (Volumetric Raymarching supporting Cloud, Fire/Flame, Plasma, Smoke, Ice/Crystal, and Fire Explosion)
export const volumetricFragmentShader = `
  uniform mat4 uModelInverse;
  varying vec3 vLocalPosition;
  varying vec3 vWorldPosition;

  uniform float uTime;
  uniform int uMode; // 0: cloud, 1: fire, 2: plasma, 3: smoke, 4: ice, 5: explosion
  uniform float uCloudDensity;
  uniform float uLightIntensity;
  uniform float uCloudScale;
  uniform vec3 uCloudColor;
  uniform vec3 uSecondaryColor;
  uniform float uEmissiveIntensity;
  uniform vec3 uLightPosition;
  uniform float uThreshold;
  uniform float uThresholdMax;
  uniform float uAbsorption;
  uniform int uSteps;
  uniform int uShadowSteps;
  uniform vec3 uWind;
  uniform int uAdditive;

  // --- 3D Analytic Perlin / Simplex style Hash Noise ---
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
        mix(hash(i + vec3(0.0,0.0,0.0)), hash(i + vec3(1.0,0.0,0.0)), f.x),
        mix(hash(i + vec3(0.0,1.0,0.0)), hash(i + vec3(1.0,1.0,0.0)), f.x),
        f.y
      ),
      mix(
        mix(hash(i + vec3(0.0,0.0,1.0)), hash(i + vec3(1.0,0.0,1.0)), f.x),
        mix(hash(i + vec3(0.0,1.0,1.0)), hash(i + vec3(1.0,1.0,1.0)), f.x),
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
      p = p * 2.04 + shift;
      a *= 0.5;
    }
    return v;
  }

  // --- Voronoi / Cellular 3D Noise for Ice, Crystals, and Plasma Tendrils ---
  float voronoi(vec3 p) {
    vec3 g = floor(p);
    vec3 f = fract(p);
    float minDist = 1.0;
    for (int k = -1; k <= 1; k++) {
      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec3 b = vec3(float(i), float(j), float(k));
          vec3 r = b - f + hash(g + b);
          float d = dot(r, r);
          if (d < minDist) {
            minDist = d;
          }
        }
      }
    }
    return sqrt(minDist);
  }

  // --- Internal Light Transmittance & Beer-Lambert Law Calculation ---
  float getLightTransmittance(vec3 localPos, vec3 lightDirLocal) {
    if (uMode == 1 || uMode == 2 || uMode == 5) {
      // Fire, plasma and explosions are self-luminous emitter volumes
      return 1.0;
    }
    float shadowDensity = 0.0;
    float shadowStepLength = 0.06;
    vec3 currentPos = localPos;

    for (int j = 0; j < 8; j++) {
      if (j >= uShadowSteps) break;
      currentPos += lightDirLocal * shadowStepLength;
      
      vec3 bDist = abs(currentPos);
      if (bDist.x >= 0.49 || bDist.y >= 0.49 || bDist.z >= 0.49) break;
      
      float bFade = smoothstep(0.48, 0.25, bDist.x) * 
                    smoothstep(0.48, 0.25, bDist.y) * 
                    smoothstep(0.48, 0.25, bDist.z);
      float rFade = smoothstep(0.70, 0.15, length(currentPos));
      
      vec3 sampleCoord = (currentPos * uCloudScale) + (uWind * uTime);
      float d = fbm(sampleCoord);
      shadowDensity += smoothstep(uThreshold, uThresholdMax, d) * (bFade * rFade) * uCloudDensity * shadowStepLength;
    }
    return exp(-shadowDensity * uAbsorption); // Beer-Lambert exponential shadow attenuation
  }

  void main() {
    // Check if camera is inside local volume bounds
    vec3 camLocalPos = (uModelInverse * vec4(cameraPosition, 1.0)).xyz;
    bool isCameraInside = abs(camLocalPos.x) <= 0.49 && abs(camLocalPos.y) <= 0.49 && abs(camLocalPos.z) <= 0.49;

    // If outside, only render front faces to avoid double-rendering back faces
    if (!isCameraInside && !gl_FrontFacing) {
      discard;
    }

    // Ray direction in world space
    vec3 rayDirWorld = normalize(vWorldPosition - cameraPosition);
    vec3 lightDirWorld = normalize(uLightPosition - vWorldPosition);

    // Transform directions to local object space
    mat3 invMat3 = mat3(uModelInverse);
    vec3 rayDirLocal = normalize(invMat3 * rayDirWorld);
    vec3 lightDirLocal = normalize(invMat3 * lightDirWorld);
    vec3 currentLocalPos = isCameraInside ? camLocalPos : vLocalPosition;

    float accumDensity = 0.0;
    vec3 accumColor = vec3(0.0);
    
    // Adaptive step length based on step count
    float stepLength = 2.4 / float(max(uSteps, 16));
    vec3 stepVector = rayDirLocal * stepLength;

    for (int i = 0; i < 64; i++) {
      if (i >= uSteps) break;

      float distFromCenter = length(currentLocalPos);
      if (distFromCenter > 1.5) break;

      // Soft container boundary falloff: smoothly fades density to 0.0 at box boundaries [-0.5, 0.5]
      vec3 bDist = abs(currentLocalPos);
      if (bDist.x >= 0.49 || bDist.y >= 0.49 || bDist.z >= 0.49) {
        currentLocalPos += stepVector;
        continue;
      }

      float boxFade = smoothstep(0.48, 0.22, bDist.x) * 
                      smoothstep(0.48, 0.22, bDist.y) * 
                      smoothstep(0.48, 0.22, bDist.z);
      float boundaryFade = boxFade * smoothstep(0.70, 0.15, distFromCenter);

      float d = 0.0;
      vec3 samplePos = currentLocalPos;

      // MODE 0: CUMULUS / GAS / STORM CLOUDS (Distintos grises con relieves y crestas plateadas)
      if (uMode == 0) {
        vec3 sampleCoord = (samplePos * uCloudScale) + (uWind * uTime);
        float n = fbm(sampleCoord);
        d = smoothstep(uThreshold, uThresholdMax, n) * boundaryFade * uCloudDensity;

        if (d > 0.002) {
          float transmittance = exp(-accumDensity * uAbsorption);
          float directLight = getLightTransmittance(currentLocalPos, lightDirLocal);
          // Multiple scattering approximation: allows soft light diffusion through dense/storm clouds
          float multiScattering = exp(-accumDensity * uAbsorption * 0.28) * 0.42;
          float totalLight = max(directLight + multiScattering, 0.22);
          
          accumDensity += d * stepLength * 1.6;

          // Storm cloud & cumulus multi-tonal gray shading:
          // 1. Highlight / silver crest along sun direction
          vec3 silverHighlight = mix(uCloudColor, vec3(0.92, 0.95, 0.98), 0.5);
          // 2. Midtone gray body
          vec3 midToneGray = uCloudColor;
          // 3. Deep storm underbelly / ambient shade
          vec3 shadowToneGray = mix(uSecondaryColor, uCloudColor * 0.5, 0.5);

          // Dynamic blending across internal shadow & light penetration
          vec3 cloudTone = mix(shadowToneGray, midToneGray, clamp(totalLight * 1.35, 0.0, 1.0));
          cloudTone = mix(cloudTone, silverHighlight, clamp(pow(directLight, 2.2) * 0.7, 0.0, 1.0));

          // Forward Mie scattering silver rim
          float sunDot = max(dot(rayDirLocal, lightDirLocal), 0.0);
          float mieSilver = pow(sunDot, 5.0) * directLight * 0.45;
          cloudTone += vec3(0.9, 0.94, 1.0) * mieSilver;

          vec3 litColor = cloudTone * (uLightIntensity * (0.35 + totalLight * 0.9));
          accumColor += transmittance * d * litColor * stepLength * 2.1;
        }
      }
      // MODE 1: FIRE / FLAME COLUMN (WebGPU Volume Fire style with heat core & turbulence)
      else if (uMode == 1) {
        // Flame buoyancy: rise upward over time with swirl turbulence
        vec3 flameCoord = samplePos;
        flameCoord.y -= uTime * length(uWind) * 1.6;
        flameCoord.xz += vec2(
          sin(samplePos.y * 4.5 + uTime * 3.5) * 0.12,
          cos(samplePos.y * 4.5 + uTime * 3.0) * 0.12
        );

        float n1 = fbm(flameCoord * uCloudScale);
        float n2 = fbm((flameCoord + vec3(3.2, 1.5, -2.1)) * (uCloudScale * 1.8));
        float combinedNoise = n1 * 0.65 + n2 * 0.35;

        // Shape fire: tapered cone from bottom to top
        float flameHeight = (samplePos.y + 0.5); // 0 at base, 1 at top
        float radiusLimit = mix(0.55, 0.15, clamp(flameHeight, 0.0, 1.0));
        float horizDist = length(samplePos.xz);
        float shapeMask = smoothstep(radiusLimit, radiusLimit * 0.3, horizDist) * smoothstep(1.1, 0.15, flameHeight) * smoothstep(-0.55, -0.4, samplePos.y);
        d = smoothstep(uThreshold, uThresholdMax, combinedNoise) * shapeMask * uCloudDensity;

        if (d > 0.002) {
          // Temperature gradient: White/Yellow core -> Vibrant Orange -> Crimson Red -> Dark Smoke Tip
          float temp = clamp(d * 1.5 - flameHeight * 0.5, 0.0, 1.0);
          vec3 flameCol = mix(vec3(0.12, 0.01, 0.01), uCloudColor, smoothstep(0.0, 0.35, temp));
          flameCol = mix(flameCol, uSecondaryColor, smoothstep(0.25, 0.68, temp));
          flameCol = mix(flameCol, vec3(1.0, 0.98, 0.85), smoothstep(0.68, 1.0, temp));

          vec3 emittedLight = flameCol * (uEmissiveIntensity * uLightIntensity * (1.2 + temp * 2.2));
          
          if (uAdditive == 1) {
            accumColor += d * emittedLight * stepLength * 2.2;
            accumDensity += d * stepLength * 0.7;
          } else {
            float transmittance = exp(-accumDensity * 1.2);
            accumColor += transmittance * d * emittedLight * stepLength * 2.0;
            accumDensity += d * stepLength * 1.2;
          }
        }
      }
      // MODE 2: PLASMA / ENERGY GAS
      else if (uMode == 2) {
        vec3 plasmaCoord = (samplePos * uCloudScale) + (uWind * uTime);
        float fbmVal = fbm(plasmaCoord);
        float voronoiVal = 1.0 - voronoi(plasmaCoord * 1.5);
        float combinedVal = mix(fbmVal, voronoiVal, 0.5);

        d = smoothstep(uThreshold, uThresholdMax, combinedVal) * boundaryFade * uCloudDensity;

        if (d > 0.002) {
          // Electric filament / plasma core color gradient
          float intensity = smoothstep(0.15, 0.85, d);
          vec3 plasmaCol = mix(uCloudColor, uSecondaryColor, intensity);
          vec3 coreCol = mix(plasmaCol, vec3(1.0, 1.0, 1.0), pow(intensity, 2.2));
          vec3 emitted = coreCol * (uEmissiveIntensity * uLightIntensity * (1.3 + intensity * 2.2));

          if (uAdditive == 1) {
            accumColor += d * emitted * stepLength * 2.2;
            accumDensity += d * stepLength * 0.7;
          } else {
            float transmittance = exp(-accumDensity * 1.0);
            accumColor += transmittance * d * emitted * stepLength * 2.0;
            accumDensity += d * stepLength * 1.1;
          }
        }
      }
      // MODE 3: SMOKE / VOLUMETRIC PLUME (Definido con remolinos curl, tonos ceniza y menos oscuro)
      else if (uMode == 3) {
        vec3 smokeCoord = (samplePos * uCloudScale) + (uWind * uTime);
        // Domain warping curl turbulence for crisp, swirling smoke puffs & wisps
        vec3 curlWarp = vec3(
          fbm(smokeCoord * 1.4 + vec3(2.1, 0.5, 1.3)),
          fbm(smokeCoord * 1.4 + vec3(0.7, 3.4, 0.2)),
          fbm(smokeCoord * 1.4 + vec3(1.5, 0.9, 4.2))
        ) * 0.38;
        
        float n = fbm(smokeCoord + curlWarp);
        // High frequency fine-curl detail
        float microDetail = noise((smokeCoord + curlWarp) * 3.8) * 0.12;
        float combinedNoise = clamp(n + microDetail, 0.0, 1.0);

        d = smoothstep(uThreshold, uThresholdMax, combinedNoise) * boundaryFade * uCloudDensity;

        if (d > 0.002) {
          float transmittance = exp(-accumDensity * uAbsorption);
          float lightTrans = getLightTransmittance(currentLocalPos, lightDirLocal);
          // Forward scattering (Mie) for realistic photographic smoke translucency
          float mieScatter = pow(max(dot(rayDirLocal, lightDirLocal), 0.0), 3.2) * 0.45;
          float diffuseLight = max(lightTrans + mieScatter, 0.32);

          accumDensity += d * stepLength * 1.35;

          // Photographic ash/graphite multi-layer smoke coloring:
          vec3 ashHighlight = mix(uSecondaryColor, vec3(0.88, 0.90, 0.94), 0.35);
          vec3 smokeBody = uCloudColor;
          vec3 smokeColor = mix(smokeBody, ashHighlight, clamp(diffuseLight * 1.15, 0.0, 1.0));

          vec3 litColor = smokeColor * (uLightIntensity * (0.42 + diffuseLight * 0.85));
          accumColor += transmittance * d * litColor * stepLength * 2.0;
        }
      }
      // MODE 4: ICE / CRYSTAL (Transparent Outer Shell + Translucent Frost/Bubble Internal Core)
      else if (uMode == 4) {
        // Compute distance from object boundary to center (box/spherical core metric)
        float maxComp = max(abs(samplePos.x), max(abs(samplePos.y), abs(samplePos.z)));
        float radDist = length(samplePos);
        float boundaryDist = max(maxComp, radDist * 0.85);

        // Core mask: 0.0 at exterior shell (boundaryDist >= 0.38) -> 100% transparent exterior!
        // Smoothly transitions to 1.0 deep inside the core (boundaryDist <= 0.20) -> translucent interior!
        float coreMask = smoothstep(0.40, 0.16, boundaryDist);

        if (coreMask > 0.001) {
          vec3 iceCoord = samplePos * uCloudScale;
          
          // 1. Voronoi internal fracture planes in the core
          float vCell = voronoi(iceCoord * 2.5);
          float cracks = 1.0 - smoothstep(0.01, 0.06, abs(vCell - 0.5));
          
          // 2. Trapped internal micro-bubbles (high-frequency cellular noise)
          float bubbleNoise = voronoi(iceCoord * 8.0);
          float bubbles = 1.0 - smoothstep(0.02, 0.07, bubbleNoise);
          
          // 3. Frost / cloudy core structure
          float frost = fbm(iceCoord * 1.8);
          float combinedCore = (frost * 0.5 + cracks * 0.35 + bubbles * 0.35) * coreMask;

          d = smoothstep(uThreshold, uThresholdMax, combinedCore) * coreMask * uCloudDensity;

          if (d > 0.001) {
            // Beer-Lambert wavelength-dependent absorption (cyan depth)
            vec3 iceAbsorptionVec = vec3(1.8, 0.5, 0.1) * uAbsorption;
            vec3 transmittance = exp(-accumDensity * iceAbsorptionVec);
            float lightTrans = getLightTransmittance(currentLocalPos, lightDirLocal);
            accumDensity += d * stepLength * 1.0;

            // Specular glint on internal fracture facets
            vec3 halfVec = normalize(lightDirLocal - rayDirLocal);
            float crackGlint = pow(max(dot(normalize(currentLocalPos + vec3(0.001)), halfVec), 0.0), 24.0) * cracks * 1.5;

            // Translucent core color: milky white frost transitioning to vibrant glacial cyan
            vec3 coreCol = mix(uSecondaryColor, uCloudColor, clamp(frost * 0.8 + bubbles * 0.5, 0.0, 1.0));
            vec3 litColor = coreCol * (uLightIntensity * (0.4 + lightTrans * 0.8)) + vec3(0.85, 0.95, 1.0) * (crackGlint + bubbles * 0.4);

            accumColor += transmittance * d * litColor * stepLength * 2.0;
          }
        }
      }
      // MODE 5: EXPLOSION / FIREBALL (Detonación, núcleo incandescente, bola de fuego y hollín turbulento)
      else if (uMode == 5) {
        vec3 expCoord = samplePos;
        expCoord.y -= uTime * length(uWind) * 1.8;
        
        float r = length(samplePos);
        vec3 radialWarp = normalize(samplePos + vec3(0.001)) * sin(r * 7.0 - uTime * 4.0) * 0.08;
        
        vec3 warp = vec3(
          fbm((expCoord + radialWarp) * uCloudScale + vec3(1.1, 0.0, 2.2)),
          fbm((expCoord + radialWarp) * uCloudScale + vec3(0.0, 3.1, 0.5)),
          fbm((expCoord + radialWarp) * uCloudScale + vec3(2.5, 1.2, 0.0))
        ) * 0.42;

        float n1 = fbm((expCoord + warp) * uCloudScale);
        float n2 = fbm((expCoord + warp) * (uCloudScale * 2.2) + vec3(4.2, 1.1, -1.5));
        float combinedNoise = n1 * 0.6 + n2 * 0.4;

        // Expanding fireball shockwave shape mask
        float fireballRadius = mix(0.68, 0.38, clamp((samplePos.y + 0.5) * 0.65, 0.0, 1.0));
        float shapeMask = smoothstep(fireballRadius, fireballRadius * 0.22, r) * smoothstep(1.2, 0.1, samplePos.y + 0.5);
        d = smoothstep(uThreshold, uThresholdMax, combinedNoise) * shapeMask * uCloudDensity;

        if (d > 0.002) {
          float coreDist = clamp(1.0 - (r / 0.68), 0.0, 1.0);
          float heat = clamp(d * 1.45 + coreDist * 0.65, 0.0, 1.0);

          // Color stages:
          // heat 0.0 - 0.22: Dark charred soot / billowing explosion smoke
          // heat 0.22 - 0.52: Crimson Red flame
          // heat 0.52 - 0.82: Fiery Blazing Orange / Amber
          // heat 0.82 - 1.00: Incandescent White-Hot blast core
          vec3 sootColor = vec3(0.12, 0.10, 0.11);
          vec3 flameRed = uCloudColor; // e.g. #ef4444
          vec3 flameOrange = uSecondaryColor; // e.g. #fbbf24
          vec3 whiteCore = vec3(1.0, 0.98, 0.90);

          vec3 expColor = mix(sootColor, flameRed, smoothstep(0.12, 0.32, heat));
          expColor = mix(expColor, flameOrange, smoothstep(0.32, 0.68, heat));
          expColor = mix(expColor, whiteCore, smoothstep(0.68, 0.94, heat));

          float glow = uEmissiveIntensity * (1.2 + heat * 3.6);
          vec3 emitted = expColor * glow * uLightIntensity;

          if (uAdditive == 1) {
            accumColor += d * emitted * stepLength * 2.2;
            accumDensity += d * stepLength * 0.75;
          } else {
            float transmittance = exp(-accumDensity * 1.1);
            accumColor += transmittance * d * emitted * stepLength * 2.2;
            accumDensity += d * stepLength * 1.15;
          }
        }
      }

      // Early break when opacity saturates
      if (accumDensity >= 0.98 && uAdditive == 0) {
        accumDensity = 1.0;
        break;
      }

      currentLocalPos += stepVector;
    }

    if (accumDensity <= 0.001 && length(accumColor) <= 0.001) {
      discard;
    }

    if (uMode == 4) {
      // Outer crystal ice surface Fresnel reflection (IOR 1.31) & subtle sun specular glint
      vec3 normalLocal = normalize(vLocalPosition);
      float cosThetaOuter = clamp(dot(-rayDirLocal, normalLocal), 0.0, 1.0);
      float fresnelOuter = 0.018 + (1.0 - 0.018) * pow(1.0 - cosThetaOuter, 4.0);
      vec3 halfVecOuter = normalize(lightDirLocal - rayDirLocal);
      float specOuter = pow(max(dot(normalLocal, halfVecOuter), 0.0), 48.0) * 1.2;

      accumColor += vec3(0.9, 0.96, 1.0) * (specOuter * 0.8 + fresnelOuter * 0.35) * uLightIntensity;
      float finalAlpha = clamp(fresnelOuter * 0.45 + accumDensity * 0.65 + specOuter * 0.5, 0.08, 0.88);
      gl_FragColor = vec4(accumColor, finalAlpha);
      return;
    }

    float finalAlpha = (uAdditive == 1) ? clamp(length(accumColor) * 0.9, 0.0, 1.0) : clamp(accumDensity, 0.0, 1.0);
    gl_FragColor = vec4(accumColor, finalAlpha);
  }
`;

function getModeEnum(mode?: VolumetricMode): number {
  switch (mode) {
    case 'fire': return 1;
    case 'plasma': return 2;
    case 'smoke': return 3;
    case 'ice': return 4;
    case 'explosion': return 5;
    case 'cloud':
    default:
      return 0;
  }
}

/**
 * Creates a THREE.ShaderMaterial configured for Volumetric Raymarching
 */
export function createRaymarchedCloudMaterial(config?: Partial<VolumetricConfig>): THREE.ShaderMaterial {
  const cfg = { ...DEFAULT_VOLUMETRIC_CONFIG, ...(config || {}) };
  const modeInt = getModeEnum(cfg.mode);
  const isAdditive = cfg.blending === 'additive' || cfg.mode === 'fire' || cfg.mode === 'plasma';

  const uniforms = {
    uTime: { value: 0 },
    uMode: { value: modeInt },
    uCloudDensity: { value: cfg.density },
    uLightIntensity: { value: cfg.lightIntensity },
    uCloudScale: { value: cfg.scale },
    uCloudColor: { value: new THREE.Color(cfg.color) },
    uSecondaryColor: { value: new THREE.Color(cfg.secondaryColor || '#f59e0b') },
    uEmissiveIntensity: { value: cfg.emissiveIntensity ?? 1.5 },
    uLightPosition: { value: new THREE.Vector3(5, 10, 5) },
    uThreshold: { value: cfg.threshold },
    uThresholdMax: { value: cfg.thresholdMax ?? 0.8 },
    uAbsorption: { value: cfg.absorption },
    uSteps: { value: cfg.steps },
    uShadowSteps: { value: cfg.shadowSteps },
    uModelInverse: { value: new THREE.Matrix4() },
    uAdditive: { value: isAdditive ? 1 : 0 },
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
    depthWrite: false, // Prevents depth sorting artifacts with other 3D geometry
    side: THREE.DoubleSide, // Full 360-degree inside/outside volumetric visibility
    blending: isAdditive ? THREE.AdditiveBlending : THREE.NormalBlending,
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

  if (config.mode !== undefined && u.uMode) {
    u.uMode.value = getModeEnum(config.mode);
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
  if (config.secondaryColor && u.uSecondaryColor) {
    u.uSecondaryColor.value.set(config.secondaryColor);
  }
  if (config.emissiveIntensity !== undefined && u.uEmissiveIntensity) {
    u.uEmissiveIntensity.value = config.emissiveIntensity;
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
  if (config.blending !== undefined && u.uAdditive) {
    const isAdd = config.blending === 'additive' || config.mode === 'fire' || config.mode === 'plasma';
    u.uAdditive.value = isAdd ? 1 : 0;
    material.blending = isAdd ? THREE.AdditiveBlending : THREE.NormalBlending;
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
    name: 'Nube Cúmulo 3D',
    desc: 'Nube algodonosa blanca con absorción Beer-Lambert y relieve suave',
    icon: '☁️',
    color: '#ffffff',
    config: {
      enabled: true,
      mode: 'cloud',
      density: 2.5,
      scale: 2.2,
      lightIntensity: 1.5,
      color: '#ffffff',
      secondaryColor: '#cbd5e1',
      emissiveIntensity: 0,
      threshold: 0.20,
      thresholdMax: 0.72,
      absorption: 1.6,
      steps: 36,
      shadowSteps: 4,
      windSpeed: 0.08,
      windDirection: [0.1, 0.05, 0.0],
      blending: 'normal',
    },
  },
  {
    id: 'storm',
    name: 'Nube de Tormenta 3D',
    desc: 'Nube tormentosa con relieves en distintos grises, crestas plateadas y base oscura',
    icon: '🌩️',
    color: '#718096',
    config: {
      enabled: true,
      mode: 'cloud',
      density: 5.5,
      scale: 5.8,
      lightIntensity: 1.5,
      color: '#718096',
      secondaryColor: '#2d3748',
      emissiveIntensity: 0,
      threshold: 0.34,
      thresholdMax: 0.86,
      absorption: 3.2,
      steps: 24,
      shadowSteps: 5,
      windSpeed: 0.12,
      windDirection: [0.15, 0.05, 0.0],
      blending: 'normal',
    },
  },
  {
    id: 'smoke_dense',
    name: 'Humo Volumétrico Definido',
    desc: 'Pluma de humo ondulante con remolinos definidos, tonos ceniza y dispersión lumínica',
    icon: '💨',
    color: '#94a3b8',
    config: {
      enabled: true,
      mode: 'smoke',
      density: 2.3,
      scale: 2.6,
      lightIntensity: 1.35,
      color: '#94a3b8',
      secondaryColor: '#64748b',
      emissiveIntensity: 0,
      threshold: 0.18,
      thresholdMax: 0.72,
      absorption: 1.2,
      steps: 38,
      shadowSteps: 5,
      windSpeed: 0.20,
      windDirection: [0.0, 0.75, 0.1],
      blending: 'normal',
    },
  },
  {
    id: 'explosion_fire',
    name: 'Explosión de Fuego 3D',
    desc: 'Detonación expansiva con núcleo incandescente, bola de fuego naranja y hollín turbulento',
    icon: '💥',
    color: '#ef4444',
    config: {
      enabled: true,
      mode: 'explosion',
      density: 3.2,
      scale: 2.2,
      lightIntensity: 2.6,
      color: '#ef4444',
      secondaryColor: '#fbbf24',
      emissiveIntensity: 4.2,
      threshold: 0.18,
      thresholdMax: 0.68,
      absorption: 1.1,
      steps: 44,
      shadowSteps: 4,
      windSpeed: 0.38,
      windDirection: [0.0, 1.0, 0.0],
      blending: 'additive',
      turbulentFlame: true,
    },
  },
  {
    id: 'fire_volumetric',
    name: 'Fuego Volumétrico 3D (Llama)',
    desc: 'Llama ardiente con núcleo térmico, convección y emisión aditiva',
    icon: '🔥',
    color: '#ef4444',
    config: {
      enabled: true,
      mode: 'fire',
      density: 2.8,
      scale: 2.4,
      lightIntensity: 2.2,
      color: '#ef4444',
      secondaryColor: '#fbbf24',
      emissiveIntensity: 3.2,
      threshold: 0.22,
      thresholdMax: 0.70,
      absorption: 1.2,
      steps: 42,
      shadowSteps: 4,
      windSpeed: 0.35,
      windDirection: [0.0, 1.2, 0.0],
      blending: 'additive',
      turbulentFlame: true,
    },
  },
  {
    id: 'plasma_gas',
    name: 'Gas Plasma / Raymarching',
    desc: 'Gas ionizado brillante con filamentos voronoi y aditividad',
    icon: '⚡',
    color: '#06b6d4',
    config: {
      enabled: true,
      mode: 'plasma',
      density: 2.6,
      scale: 2.0,
      lightIntensity: 2.0,
      color: '#06b6d4',
      secondaryColor: '#a855f7',
      emissiveIntensity: 2.8,
      threshold: 0.20,
      thresholdMax: 0.72,
      absorption: 1.0,
      steps: 40,
      shadowSteps: 4,
      windSpeed: 0.12,
      windDirection: [0.1, 0.05, 0.1],
      blending: 'additive',
    },
  },
  {
    id: 'fog_dense',
    name: 'Niebla / Bruma Densa',
    desc: 'Capa de niebla volumétrica con dispersión suave de luz ambiental',
    icon: '🌫️',
    color: '#e2e8f0',
    config: {
      enabled: true,
      mode: 'cloud',
      density: 1.8,
      scale: 1.4,
      lightIntensity: 1.2,
      color: '#f1f5f9',
      secondaryColor: '#cbd5e1',
      emissiveIntensity: 0,
      threshold: 0.12,
      thresholdMax: 0.85,
      absorption: 0.8,
      steps: 32,
      shadowSteps: 4,
      windSpeed: 0.05,
      windDirection: [0.1, 0.0, 0.05],
      blending: 'normal',
    },
  },
  {
    id: 'nebula_cosmic',
    name: 'Nebulosa Cósmica 3D',
    desc: 'Gas estelar profundo con tonalidades púrpura y magenta',
    icon: '🌌',
    color: '#c084fc',
    config: {
      enabled: true,
      mode: 'plasma',
      density: 2.2,
      scale: 1.6,
      lightIntensity: 1.8,
      color: '#c084fc',
      secondaryColor: '#f43f5e',
      emissiveIntensity: 2.4,
      threshold: 0.22,
      thresholdMax: 0.72,
      absorption: 1.2,
      steps: 36,
      shadowSteps: 4,
      windSpeed: 0.05,
      windDirection: [0.05, 0.02, 0.08],
      blending: 'additive',
    },
  },
  {
    id: 'aurora_borealis',
    name: 'Aurora Boreal Volumétrica',
    desc: 'Cortina de luz fluorescente ondulante en esmeralda y cian',
    icon: '✨',
    color: '#34d399',
    config: {
      enabled: true,
      mode: 'plasma',
      density: 2.0,
      scale: 1.8,
      lightIntensity: 1.8,
      color: '#10b981',
      secondaryColor: '#06b6d4',
      emissiveIntensity: 2.2,
      threshold: 0.25,
      thresholdMax: 0.78,
      absorption: 1.0,
      steps: 36,
      shadowSteps: 4,
      windSpeed: 0.08,
      windDirection: [0.1, 0.0, 0.1],
      blending: 'additive',
    },
  },
  {
    id: 'ice_crystal',
    name: 'Hielo / Cristal Volumétrico',
    desc: 'Cubo de hielo translúcido con fracturas internas y micro-burbujas',
    icon: '🧊',
    color: '#bae6fd',
    config: {
      enabled: true,
      mode: 'ice',
      density: 2.4,
      scale: 2.0,
      lightIntensity: 1.6,
      color: '#bae6fd',
      secondaryColor: '#38bdf8',
      emissiveIntensity: 0.2,
      threshold: 0.15,
      thresholdMax: 0.80,
      absorption: 0.9,
      steps: 36,
      shadowSteps: 4,
      windSpeed: 0.0,
      windDirection: [0.0, 0.0, 0.0],
      blending: 'normal',
    },
  },
];
