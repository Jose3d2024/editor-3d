import * as THREE from 'three';

export function setupTriplanarMaterial(material: THREE.Material, mData: any) {
  const prevOnBeforeCompile = material.onBeforeCompile;

  material.onBeforeCompile = (shader, renderer) => {
    if (prevOnBeforeCompile) {
      prevOnBeforeCompile(shader, renderer);
    }

    // ── 1. EXTRAER EL VALOR EXACTO Y PURO DE TU SLIDER DE INTERFAZ ──
    let sliderVal = 1.0;
    if (typeof mData?.mapRepeat === 'number') {
      sliderVal = mData.mapRepeat;
    } else if (Array.isArray(mData?.mapRepeat)) {
      sliderVal = mData.mapRepeat[0] ?? 1.0;
    } else if (typeof mData?.tiling === 'number') {
      sliderVal = mData.tiling;
    } else if (typeof mData?.triplanarScale === 'number') {
      sliderVal = mData.triplanarScale;
    }

    // Adaptador de ajuste de frecuencia óptima para el ruido estocástico
    const finalScaleFactor = sliderVal * 0.5; 

    // Suavizado de bordes / Blend (0.0 = duro, 0.5 = normal, 1.0 = ultra suave)
    const rawBlendVal = typeof mData?.triplanarBlend === 'number' ? mData.triplanarBlend : 0.5;
    const blendClamped = Math.min(1.0, Math.max(0.0, rawBlendVal));
    // Mapear 0.0 -> exponente 32 (duro), 0.5 -> exponente 8, 1.0 -> exponente 1.2 (difuminado suave)
    const blendExponent = Math.max(1.0, 32.0 * Math.pow(1.0 - blendClamped, 2.0));

    // Crear el Vector2 de escala para las proyecciones de coordenadas
    const scaleVec = Array.isArray(mData?.mapRepeat)
      ? new THREE.Vector2(mData.mapRepeat[0] * 0.5, mData.mapRepeat[1] * 0.5)
      : new THREE.Vector2(finalScaleFactor, finalScaleFactor);

    // ── 2. ASIGNAR LOS UNIFORMS VIVOS A LA GPU ──
    shader.uniforms.uMixosScale = { value: finalScaleFactor };
    shader.uniforms.triplanarScale = { value: scaleVec };
    shader.uniforms.uTriplanarBlend = { value: blendExponent };
    (material as any).userData.triplanarShader = shader;
    
    // Vertex shader modifications
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `
      #include <common>
      #define TRIPLANAR_SCALE
      varying vec3 vLocalPosition;
      varying vec3 vLocalNormal;
      varying vec3 vMixosPosition;
      varying vec3 vMixosNormal;
      uniform float uMixosScale;
      uniform vec2 triplanarScale;
      uniform float uTriplanarBlend;
      `
    );
    
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vLocalPosition = position;
      vLocalNormal = normalize(normal);
      vMixosPosition = position;
      vMixosNormal = normalize(normal);
      `
    );

    // Fragment shader modifications: Stochastic Hexagonal Anti-Tiling Triplanar Mapping
    const mixosAntiTilingCode = `
      varying vec3 vLocalPosition;
      varying vec3 vLocalNormal;
      varying vec3 vMixosPosition;
      varying vec3 vMixosNormal;
      uniform float uMixosScale;
      uniform vec2 triplanarScale;
      uniform float uTriplanarBlend;

      vec2 mixosHash2D(vec2 p) {
        vec2 k = p + vec2(123.456, 789.012);
        float h1 = fract(sin(dot(k, vec2(12.9898, 78.233))) * 43758.5453123);
        float h2 = fract(sin(dot(k, vec2(37.7190, 51.621))) * 28193.1847123);
        return vec2(h1, h2);
      }

      vec4 sampleMixosSeamless(sampler2D tex, vec2 uv, bool isNormalMap) {
        // Offset UV so origin (0,0) is not at a grid boundary line
        vec2 p = uv + vec2(17.31, 29.43);

        // Skew to triangular/hexagonal lattice
        vec2 skewUV = mat2(1.0, 0.0, 0.57735, 1.1547) * p;
        vec2 fl = floor(skewUV);
        vec2 fr = fract(skewUV);
        
        // Barycentric weights
        vec3 w = vec3(fr.x, fr.y, 1.0 - fr.x - fr.y);
        if (w.z < 0.0) {
          w = vec3(1.0 - fr.x, 1.0 - fr.y, fr.x + fr.y - 1.0);
        }
        
        // Smooth Hermite cubic weights to eliminate harsh grid boundaries
        w = w * w * (3.0 - 2.0 * w);
        float totalW = w.x + w.y + w.z;
        w /= totalW;

        vec2 cell1 = fl;
        vec2 cell2 = fl + vec2(1.0, 0.0);
        vec2 cell3 = fl + vec2(0.0, 1.0);

        // Non-separable 2D hash
        vec2 h1 = mixosHash2D(cell1);
        vec2 h2 = mixosHash2D(cell2);
        vec2 h3 = mixosHash2D(cell3);

        // Direction-preserving translation offsets (prevents swirling wood grain)
        vec2 uv1 = p + h1 * 19.31;
        vec2 uv2 = p + h2 * 27.13;
        vec2 uv3 = p + h3 * 31.87;

        vec4 c1 = texture2D(tex, uv1);
        vec4 c2 = texture2D(tex, uv2);
        vec4 c3 = texture2D(tex, uv3);

        if (isNormalMap) {
          vec3 n1 = c1.xyz * 2.0 - 1.0;
          vec3 n2 = c2.xyz * 2.0 - 1.0;
          vec3 n3 = c3.xyz * 2.0 - 1.0;
          vec3 norm = normalize(n1 * w.x + n2 * w.y + n3 * w.z);
          return vec4(norm * 0.5 + 0.5, c1.w * w.x + c2.w * w.y + c3.w * w.z);
        }

        return c1 * w.x + c2 * w.y + c3 * w.z;
      }

      vec4 sampleMixosTriplanar(sampler2D tex, vec3 pos, vec3 normal, vec2 scale, bool isNormalMap) {
        vec3 blend = pow(abs(normal), vec3(uTriplanarBlend));
        float total = blend.x + blend.y + blend.z + 0.00001;
        blend /= total;
        
        vec2 uvX = pos.zy;
        vec2 uvY = pos.xz;
        vec2 uvZ = pos.xy;

        vec4 cx = sampleMixosSeamless(tex, uvX * scale, isNormalMap);
        vec4 cy = sampleMixosSeamless(tex, uvY * scale, isNormalMap);
        vec4 cz = sampleMixosSeamless(tex, uvZ * scale, isNormalMap);
        
        return cx * blend.x + cy * blend.y + cz * blend.z;
      }

      vec4 sampleMixosTriplanar(sampler2D tex, vec3 pos, vec3 normal, vec2 scale) {
        return sampleMixosTriplanar(tex, pos, normal, scale, false);
      }

      vec4 sampleMixosTriplanar(sampler2D tex, vec3 pos, vec3 normal) {
        return sampleMixosTriplanar(tex, pos, normal, vec2(uMixosScale, uMixosScale), false);
      }
    `;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\n${mixosAntiTilingCode}`
    );

    const hasMap = !!((material as any).map || mData.map || mData.mapAlbedo);
    const hasNormal = !!((material as any).normalMap || mData.normalMap || mData.mapNormal);
    const hasRoughness = !!((material as any).roughnessMap || mData.roughnessMap || mData.mapRoughness);
    const hasMetalness = !!((material as any).metalnessMap || mData.metalnessMap || mData.mapMetalness);

    // Replace map
    if (hasMap) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
        #ifdef USE_MAP
          vec4 texelColor = sampleMixosTriplanar(map, vLocalPosition, vLocalNormal, triplanarScale);
          diffuseColor *= texelColor;
        #endif
        `
      );
    }
    
    // Replace normal map
    if (hasNormal) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `
        #ifdef USE_NORMALMAP
          vec4 mapN = sampleMixosTriplanar(normalMap, vLocalPosition, vLocalNormal, triplanarScale, true);
          vec3 tnormal = mapN.xyz * 2.0 - 1.0;
          normal = normalize(vLocalNormal + tnormal * normalScale.x);
        #endif
        `
      );
    }
    
    // Replace roughness map
    if (hasRoughness) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `
        float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          vec4 texelRoughness = sampleMixosTriplanar(roughnessMap, vLocalPosition, vLocalNormal, triplanarScale);
          roughnessFactor *= texelRoughness.g;
        #endif
        `
      );
    }
    
    // Replace metalness map
    if (hasMetalness) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <metalnessmap_fragment>',
        `
        float metalnessFactor = metalness;
        #ifdef USE_METALNESSMAP
          vec4 texelMetalness = sampleMixosTriplanar(metalnessMap, vLocalPosition, vLocalNormal, triplanarScale);
          metalnessFactor *= texelMetalness.b;
        #endif
        `
      );
    }
  };
  
  material.needsUpdate = true;
}

