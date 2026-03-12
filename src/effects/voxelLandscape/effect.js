/**
 * Voxel Landscape — Classic variant
 *
 * Heightmap-based landscape rendered via raymarching in the fragment shader.
 * Procedural terrain with distance fog and retro color palette.
 * Inspired by Comanche-style voxel rendering from the early 90s.
 * Original source: related to the landscape sections of SecondReality.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';

const FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform float uTime;
uniform float uBeat;
uniform vec2 uResolution;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float terrain(vec2 p) {
  float h = 0.0;
  float a = 0.5;
  float f = 1.0;
  for (int i = 0; i < 6; i++) {
    h += a * noise(p * f);
    f *= 2.0;
    a *= 0.5;
  }
  return h;
}

vec3 terrainColor(float h, float dist) {
  vec3 water = vec3(0.1, 0.2, 0.5);
  vec3 sand = vec3(0.6, 0.5, 0.3);
  vec3 grass = vec3(0.2, 0.5, 0.15);
  vec3 rock = vec3(0.4, 0.35, 0.3);
  vec3 snow = vec3(0.9, 0.9, 0.95);

  vec3 c = water;
  c = mix(c, sand, smoothstep(0.2, 0.25, h));
  c = mix(c, grass, smoothstep(0.3, 0.4, h));
  c = mix(c, rock, smoothstep(0.55, 0.65, h));
  c = mix(c, snow, smoothstep(0.75, 0.85, h));
  return c;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - uResolution * 0.5) / uResolution.y;
  float beatPulse = pow(1.0 - uBeat, 4.0);

  // Camera setup — flying over terrain
  float camSpeed = uTime * 0.4;
  vec3 ro = vec3(camSpeed, 0.8 + beatPulse * 0.2, camSpeed * 0.6);
  vec3 target = ro + vec3(cos(uTime * 0.2), -0.2, sin(uTime * 0.2));
  vec3 forward = normalize(target - ro);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
  vec3 up = cross(forward, right);
  vec3 rd = normalize(uv.x * right + uv.y * up + 1.5 * forward);

  // Raymarch through heightfield
  vec3 color = vec3(0.0);
  float t = 0.1;
  bool hit = false;

  for (int i = 0; i < 100; i++) {
    vec3 p = ro + rd * t;
    float h = terrain(p.xz * 0.3) * 2.0;

    if (p.y < h) {
      hit = true;

      // Binary search for precise intersection
      float tMin = t - 0.5;
      float tMax = t;
      for (int j = 0; j < 8; j++) {
        float tMid = (tMin + tMax) * 0.5;
        vec3 pm = ro + rd * tMid;
        float hm = terrain(pm.xz * 0.3) * 2.0;
        if (pm.y < hm) tMax = tMid; else tMin = tMid;
      }
      t = (tMin + tMax) * 0.5;
      vec3 hitP = ro + rd * t;
      float hitH = terrain(hitP.xz * 0.3);

      // Compute normal via central differences
      vec2 e = vec2(0.01, 0.0);
      vec3 n = normalize(vec3(
        terrain((hitP.xz + e.xy) * 0.3) - terrain((hitP.xz - e.xy) * 0.3),
        0.04,
        terrain((hitP.xz + e.yx) * 0.3) - terrain((hitP.xz - e.yx) * 0.3)
      ));

      // Lighting
      vec3 lightDir = normalize(vec3(0.5, 0.8, 0.3));
      float diff = max(dot(n, lightDir), 0.0);

      color = terrainColor(hitH, t) * (0.3 + 0.7 * diff);
      break;
    }
    t += max(0.02, (p.y - h) * 0.4);
    if (t > 40.0) break;
  }

  // Sky gradient
  if (!hit) {
    float skyGrad = max(rd.y, 0.0);
    color = mix(vec3(0.7, 0.5, 0.3), vec3(0.3, 0.5, 0.9), skyGrad);
    // Sun
    float sun = pow(max(dot(rd, normalize(vec3(0.5, 0.8, 0.3))), 0.0), 64.0);
    color += vec3(1.0, 0.9, 0.6) * sun;
  }

  // Distance fog
  float fog = 1.0 - exp(-t * 0.04);
  vec3 fogColor = vec3(0.5, 0.5, 0.6);
  color = mix(color, fogColor, fog);

  fragColor = vec4(color, 1.0);
}
`;

let program = null;
let quad = null;
let uTime, uBeat, uResolution;

export default {
  label: 'voxelLandscape',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uTime = gl.getUniformLocation(program, 'uTime');
    uBeat = gl.getUniformLocation(program, 'uBeat');
    uResolution = gl.getUniformLocation(program, 'uResolution');
  },

  render(gl, t, beat, _params) {
    gl.useProgram(program);
    gl.uniform1f(uTime, t);
    gl.uniform1f(uBeat, beat);
    gl.uniform2f(uResolution, gl.drawingBufferWidth, gl.drawingBufferHeight);
    quad.draw();
  },

  destroy(gl) {
    if (program) gl.deleteProgram(program);
    if (quad) quad.destroy();
    program = null;
    quad = null;
  },
};
