/**
 * GLENZ_3D — Remastered variant (Part 6)
 *
 * GPU-rendered translucent Tetrakis hexahedra with true alpha blending,
 * Phong/Blinn lighting, Fresnel glass transparency, bloom post-processing,
 * and beat-reactive enhancements.
 *
 * Uses the same animation state machine as the classic variant (via
 * animation.js) to guarantee frame-perfect choreography sync.
 *
 * This is the first effect to use a custom vertex pipeline — all other
 * effects use only the shared FULLSCREEN_VERT passthrough.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { CHECKERBOARD_B64 } from '../glenzTransition/data.js';
import { G1_VERTS, G2_VERTS, G1_FACES, G2_FACES } from './data.js';
import {
  FRAME_RATE, DEG, clamp, createState, initState, stepFrame, computeRotationMatrix,
} from './animation.js';

// ── Shaders ──────────────────────────────────────────────────────

const MESH_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;

uniform mat4 uModelView;
uniform mat4 uProjection;
uniform mat3 uNormalMatrix;

out vec3 vNormal;
out vec3 vViewPos;

void main() {
  vec4 mvPos = uModelView * vec4(aPosition, 1.0);
  vViewPos = mvPos.xyz;
  vNormal = normalize(uNormalMatrix * aNormal);
  gl_Position = uProjection * mvPos;
}
`;

const MESH_FRAG = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vViewPos;

uniform vec3 uBaseColor;
uniform float uAlpha;
uniform float uSpecularPower;
uniform float uBeat;
uniform float uFade;
uniform bool uIsBackFace;

out vec4 fragColor;

void main() {
  vec3 N = normalize(vNormal);
  if (uIsBackFace) N = -N;

  vec3 V = normalize(-vViewPos);
  vec3 L = normalize(vec3(0.5, 0.8, 0.6));

  float diff = max(dot(N, L), 0.0);
  vec3 H = normalize(L + V);
  float beatPulse = pow(1.0 - uBeat, 6.0);
  float specPow = uSpecularPower + beatPulse * 32.0;
  float spec = pow(max(dot(N, H), 0.0), specPow);

  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  float alpha = mix(uAlpha * 0.4, uAlpha, fresnel);
  if (uIsBackFace) alpha *= 0.35;

  vec3 ambient = uBaseColor * 0.15;
  vec3 diffuse = uBaseColor * diff * 0.7;
  vec3 specular = vec3(1.0) * spec * (0.6 + beatPulse * 0.4);

  vec3 color = ambient + diffuse + specular;
  fragColor = vec4(color * uFade, alpha * uFade);
}
`;

const GROUND_FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uCheckerTex;
uniform float uFade;

void main() {
  vec2 uv = vUV;
  uv.y = 1.0 - uv.y;

  // Classic ground strip: rows 153–199 in a 200px buffer = 76.5%–100% from top.
  float groundTop = 0.765;
  if (uv.y < groundTop) { discard; }

  // Classic samples source rows 0..97 out of 200 (top 49% of checker texture).
  float t = (uv.y - groundTop) / (1.0 - groundTop);
  vec2 checkerUV = vec2(uv.x, t * 0.49);
  vec3 color = texture(uCheckerTex, checkerUV).rgb;

  fragColor = vec4(color * uFade, uFade);
}
`;

const BLOOM_EXTRACT_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uScene;
uniform float uThreshold;
void main() {
  vec3 c = texture(uScene, vUV).rgb;
  float brightness = dot(c, vec3(0.2126, 0.7152, 0.0722));
  fragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.3, brightness), 1.0);
}
`;

const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2 uDirection;
uniform vec2 uResolution;

void main() {
  vec2 texel = uDirection / uResolution;
  vec3 result = vec3(0.0);
  result += texture(uTex, vUV - 4.0 * texel).rgb * 0.0162;
  result += texture(uTex, vUV - 3.0 * texel).rgb * 0.0540;
  result += texture(uTex, vUV - 2.0 * texel).rgb * 0.1216;
  result += texture(uTex, vUV - 1.0 * texel).rgb * 0.1945;
  result += texture(uTex, vUV).rgb * 0.2270;
  result += texture(uTex, vUV + 1.0 * texel).rgb * 0.1945;
  result += texture(uTex, vUV + 2.0 * texel).rgb * 0.1216;
  result += texture(uTex, vUV + 3.0 * texel).rgb * 0.0540;
  result += texture(uTex, vUV + 4.0 * texel).rgb * 0.0162;
  fragColor = vec4(result, 1.0);
}
`;

const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;
uniform float uBeat;

void main() {
  vec3 scene = texture(uScene, vUV).rgb;
  vec3 bloom = texture(uBloom, vUV).rgb;
  float beatPulse = pow(1.0 - uBeat, 6.0);
  float strength = uBloomStrength + beatPulse * 0.15;
  vec3 color = scene + bloom * strength;

  float scanline = 0.95 + 0.05 * sin(gl_FragCoord.y * 3.14159);
  color *= scanline;

  fragColor = vec4(color, 1.0);
}
`;

// ── Geometry builder ─────────────────────────────────────────────

function buildMeshData(verts, faces) {
  const positions = [];
  const normals = [];
  const faceColors = [];

  for (const [col, ai, bi, ci] of faces) {
    const a = verts[ai], b = verts[bi], c = verts[ci];

    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= len; ny /= len; nz /= len;

    positions.push(...a, ...b, ...c);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    faceColors.push(col);
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    faceColors,
    triCount: faces.length,
  };
}

function createMeshVAO(gl, mesh) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  const normBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);
  return { vao, posBuf, normBuf, triCount: mesh.triCount };
}

// ── Matrix math (column-major for WebGL) ─────────────────────────

function mat4ClassicProjection(near, far) {
  // Replicates the classic's anisotropic, off-center projection:
  //   screen_x = x * 256/z + 160   (PROJ_XMUL=256, PROJ_XADD=160 in 320px)
  //   screen_y = y * 213/z + 130   (PROJ_YMUL=213, PROJ_YADD=130 in 200px → 256px display)
  //
  // NDC equivalents (accounting for 200→256 stretch):
  //   ndc_x = x * 1.6 / z            (Sx = 2*256/320)
  //   ndc_y = -y * 2.13 / z - 0.3    (Sy = 2*213/200, Oy = 1 - 2*130/200 * 256/200... = 0.3)
  const nf = 1 / (near - far);
  return new Float32Array([
    1.6,  0,    0,                0,
    0,    2.13, 0,                0,
    0,    0.3,  (far + near) * nf, -1,
    0,    0,    2 * far * near * nf, 0,
  ]);
}

function mat4Identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function mat4Multiply(a, b) {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      o[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] +
                      a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
    }
  }
  return o;
}

function mat4FromRotScale(rot3x3, sx, sy, sz, tx, ty, tz) {
  return new Float32Array([
    rot3x3[0] * sx, rot3x3[3] * sx, rot3x3[6] * sx, 0,
    rot3x3[1] * sy, rot3x3[4] * sy, rot3x3[7] * sy, 0,
    rot3x3[2] * sz, rot3x3[5] * sz, rot3x3[8] * sz, 0,
    tx, ty, tz, 1,
  ]);
}

function mat3NormalFromMat4(m) {
  const a00 = m[0], a01 = m[1], a02 = m[2];
  const a10 = m[4], a11 = m[5], a12 = m[6];
  const a20 = m[8], a21 = m[9], a22 = m[10];
  const det = a00 * (a11 * a22 - a12 * a21) -
              a01 * (a10 * a22 - a12 * a20) +
              a02 * (a10 * a21 - a11 * a20);
  const id = 1 / det;
  return new Float32Array([
    (a11 * a22 - a12 * a21) * id,
    (a02 * a21 - a01 * a22) * id,
    (a01 * a12 - a02 * a11) * id,
    (a12 * a20 - a10 * a22) * id,
    (a00 * a22 - a02 * a20) * id,
    (a02 * a10 - a00 * a12) * id,
    (a10 * a21 - a11 * a20) * id,
    (a01 * a20 - a00 * a21) * id,
    (a00 * a11 - a01 * a10) * id,
  ]);
}

function mat4Translate(m, x, y, z) {
  const t = mat4Identity();
  t[12] = x; t[13] = y; t[14] = z;
  return mat4Multiply(m, t);
}

// ── FBO helper ───────────────────────────────────────────────────

function createFBO(gl, w, h) {
  const fb = gl.createFramebuffer();
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    console.error('FBO incomplete:', status);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, tex };
}

// ── Checkerboard texture loader ──────────────────────────────────

function b64ToUint8(b64) {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

function loadCheckerTexture(gl) {
  const raw = b64ToUint8(CHECKERBOARD_B64);
  const palette = new Uint8Array(768);
  for (let i = 0; i < 768; i++) palette[i] = raw[16 + i];
  const W = 320, H = 200;
  const pixels = new Uint8Array(W * H * 4);
  const k = 255 / 63;
  for (let i = 0; i < W * H; i++) {
    const idx = raw[768 + 16 + i];
    pixels[i * 4]     = Math.round(clamp(palette[idx * 3], 0, 63) * k);
    pixels[i * 4 + 1] = Math.round(clamp(palette[idx * 3 + 1], 0, 63) * k);
    pixels[i * 4 + 2] = Math.round(clamp(palette[idx * 3 + 2], 0, 63) * k);
    pixels[i * 4 + 3] = 255;
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// ── Face sorting ─────────────────────────────────────────────────

function sortFacesByDepth(faces, verts, modelView) {
  const sorted = faces.map(([col, ai, bi, ci], idx) => {
    const a = verts[ai], b = verts[bi], c = verts[ci];
    const cx = (a[0] + b[0] + c[0]) / 3;
    const cy = (a[1] + b[1] + c[1]) / 3;
    const cz = (a[2] + b[2] + c[2]) / 3;
    const viewZ = modelView[2] * cx + modelView[6] * cy + modelView[10] * cz + modelView[14];
    return { idx, depth: viewZ };
  });
  sorted.sort((a, b) => a.depth - b.depth);
  return sorted;
}

// ── Glenz1 face color mapping ────────────────────────────────────

function getGlenz1Color(faceColor, isFront) {
  if (!isFront) {
    if (faceColor & 1) return { r: 0.15, g: 0.25, b: 0.9, a: 0.25 };
    return null;
  }
  if (faceColor & 1) return { r: 0.2, g: 0.5, b: 1.0, a: 0.55 };
  return { r: 0.85, g: 0.9, b: 1.0, a: 0.45 };
}

function getGlenz2Color(faceColor, isFront) {
  if (isFront) {
    if ((faceColor >> 1) & 1) return { r: 1.0, g: 0.25, b: 0.15, a: 0.45 };
    return null;
  }
  if (faceColor === 0) return null;
  return { r: 0.7, g: 0.1, b: 0.08, a: 0.3 };
}

// ── Module state ─────────────────────────────────────────────────

let meshProg, groundProg, bloomExtractProg, blurProg, compositeProg;
let quad;
let g1Mesh, g2Mesh, g1VAO, g2VAO;
let checkerTex;
let sceneFBO, bloomFBO1, bloomFBO2;
let checkerPal8;

const IW = 320, IH = 256;

// ── Uniform cache ────────────────────────────────────────────────

let mu = {}, gu = {}, beu = {}, blu = {}, cu = {};

export default {
  label: 'glenzVectors (remastered)',

  init(gl) {
    meshProg = createProgram(gl, MESH_VERT, MESH_FRAG);
    groundProg = createProgram(gl, FULLSCREEN_VERT, GROUND_FRAG);
    bloomExtractProg = createProgram(gl, FULLSCREEN_VERT, BLOOM_EXTRACT_FRAG);
    blurProg = createProgram(gl, FULLSCREEN_VERT, BLUR_FRAG);
    compositeProg = createProgram(gl, FULLSCREEN_VERT, COMPOSITE_FRAG);

    quad = createFullscreenQuad(gl);

    mu = {
      modelView: gl.getUniformLocation(meshProg, 'uModelView'),
      projection: gl.getUniformLocation(meshProg, 'uProjection'),
      normalMatrix: gl.getUniformLocation(meshProg, 'uNormalMatrix'),
      baseColor: gl.getUniformLocation(meshProg, 'uBaseColor'),
      alpha: gl.getUniformLocation(meshProg, 'uAlpha'),
      specularPower: gl.getUniformLocation(meshProg, 'uSpecularPower'),
      beat: gl.getUniformLocation(meshProg, 'uBeat'),
      fade: gl.getUniformLocation(meshProg, 'uFade'),
      isBackFace: gl.getUniformLocation(meshProg, 'uIsBackFace'),
    };

    gu = {
      checkerTex: gl.getUniformLocation(groundProg, 'uCheckerTex'),
      fade: gl.getUniformLocation(groundProg, 'uFade'),
    };

    beu = {
      scene: gl.getUniformLocation(bloomExtractProg, 'uScene'),
      threshold: gl.getUniformLocation(bloomExtractProg, 'uThreshold'),
    };

    blu = {
      tex: gl.getUniformLocation(blurProg, 'uTex'),
      direction: gl.getUniformLocation(blurProg, 'uDirection'),
      resolution: gl.getUniformLocation(blurProg, 'uResolution'),
    };

    cu = {
      scene: gl.getUniformLocation(compositeProg, 'uScene'),
      bloom: gl.getUniformLocation(compositeProg, 'uBloom'),
      bloomStrength: gl.getUniformLocation(compositeProg, 'uBloomStrength'),
      beat: gl.getUniformLocation(compositeProg, 'uBeat'),
    };

    g1Mesh = buildMeshData(G1_VERTS, G1_FACES);
    g2Mesh = buildMeshData(G2_VERTS, G2_FACES);
    g1VAO = createMeshVAO(gl, g1Mesh);
    g2VAO = createMeshVAO(gl, g2Mesh);

    checkerTex = loadCheckerTexture(gl);

    const raw = b64ToUint8(CHECKERBOARD_B64);
    checkerPal8 = new Float64Array(24);
    for (let i = 0; i < 24; i++) checkerPal8[i] = raw[16 + i];

    sceneFBO = createFBO(gl, IW, IH);
    bloomFBO1 = createFBO(gl, IW >> 1, IH >> 1);
    bloomFBO2 = createFBO(gl, IW >> 1, IH >> 1);
  },

  render(gl, t, beat, _params) {
    const floatFrame = t * FRAME_RATE;
    const intFrame = Math.floor(floatFrame);

    const s = createState();
    initState(s, checkerPal8);
    for (let f = 0; f <= intFrame; f++) stepFrame(s, f);

    const rx = (32 * floatFrame) % (3 * 3600);
    const ry = (7 * floatFrame) % (3 * 3600);

    let fade = 1.0;
    if (intFrame > 2069) fade = clamp((2069 + 64 - intFrame) / 64, 0, 1);

    const beatPulse = Math.pow(1.0 - beat, 6.0);
    const scaleBeat = 1.0 + beatPulse * 0.02;

    const projection = mat4ClassicProjection(100, 80000);

    const view = mat4Identity();
    view[14] = -7500;

    // ── Render to scene FBO ──────────────────────────────────────

    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO.fb);
    gl.viewport(0, 0, IW, IH);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Ground plane (checkerboard)
    if (!s.bgCleared) {
      const groundFade = (intFrame > 700 && intFrame < 765)
        ? clamp((764 - intFrame) / 64, 0, 1)
        : (intFrame >= 765 ? 0 : 1);

      if (groundFade > 0) {
        gl.useProgram(groundProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, checkerTex);
        gl.uniform1i(gu.checkerTex, 0);
        gl.uniform1f(gu.fade, groundFade * fade);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        quad.draw();
        gl.disable(gl.BLEND);
      }
    }

    // Objects
    gl.useProgram(meshProg);
    gl.uniformMatrix4fv(mu.projection, false, projection);
    gl.uniform1f(mu.beat, beat);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Glenz2 (drawn first — farther back, below Glenz1 in painter order)
    if (intFrame > 800 && s.g2s > 4) {
      const sf = s.g2s * 64 / 32768 * scaleBeat;
      const rot2 = computeRotationMatrix(
        (3600 - rx / 3) % (3 * 3600),
        (3600 - ry / 3) % (3 * 3600),
        0,
      );
      const model2 = mat4FromRotScale(rot2, sf, sf, sf,
        s.g2tx, -(s.ypos + 1500 + s.g2ty), s.g2tz);
      const mv2 = mat4Multiply(view, model2);
      const nm2 = mat3NormalFromMat4(mv2);

      gl.uniformMatrix4fv(mu.modelView, false, mv2);
      gl.uniformMatrix3fv(mu.normalMatrix, false, nm2);
      gl.uniform1f(mu.specularPower, 48.0);
      gl.uniform1f(mu.fade, fade);

      const sorted2 = sortFacesByDepth(G2_FACES, G2_VERTS, mv2);
      gl.bindVertexArray(g2VAO.vao);
      for (const { idx } of sorted2) {
        const col = G2_FACES[idx][0];
        const frontColor = getGlenz2Color(col, true);
        if (frontColor) {
          gl.uniform3f(mu.baseColor, frontColor.r, frontColor.g, frontColor.b);
          gl.uniform1f(mu.alpha, frontColor.a);
          gl.uniform1i(mu.isBackFace, 0);
          gl.drawArrays(gl.TRIANGLES, idx * 3, 3);
        }
        const backColor = getGlenz2Color(col, false);
        if (backColor) {
          gl.uniform3f(mu.baseColor, backColor.r, backColor.g, backColor.b);
          gl.uniform1f(mu.alpha, backColor.a);
          gl.uniform1i(mu.isBackFace, 1);
          gl.drawArrays(gl.TRIANGLES, idx * 3, 3);
        }
      }
      gl.bindVertexArray(null);
    }

    // Glenz1
    if (s.g1sx > 4) {
      const sfx = s.g1sx * 64 / 32768 * scaleBeat;
      const sfy = s.g1sy * 64 / 32768 * scaleBeat;
      const sfz = s.g1sz * 64 / 32768 * scaleBeat;
      const rot1 = computeRotationMatrix(rx, ry, 0);
      const model1 = mat4FromRotScale(rot1, sfx, sfy, sfz,
        s.g1tx, -(s.ypos + 1500 + s.g1ty), s.g1tz);
      const mv1 = mat4Multiply(view, model1);
      const nm1 = mat3NormalFromMat4(mv1);

      gl.uniformMatrix4fv(mu.modelView, false, mv1);
      gl.uniformMatrix3fv(mu.normalMatrix, false, nm1);
      gl.uniform1f(mu.specularPower, 64.0);
      gl.uniform1f(mu.fade, fade);

      const sorted1 = sortFacesByDepth(G1_FACES, G1_VERTS, mv1);
      gl.bindVertexArray(g1VAO.vao);
      for (const { idx } of sorted1) {
        const col = G1_FACES[idx][0];
        const frontColor = getGlenz1Color(col, true);
        if (frontColor) {
          gl.uniform3f(mu.baseColor, frontColor.r, frontColor.g, frontColor.b);
          gl.uniform1f(mu.alpha, frontColor.a);
          gl.uniform1i(mu.isBackFace, 0);
          gl.drawArrays(gl.TRIANGLES, idx * 3, 3);
        }
        const backColor = getGlenz1Color(col, false);
        if (backColor) {
          gl.uniform3f(mu.baseColor, backColor.r, backColor.g, backColor.b);
          gl.uniform1f(mu.alpha, backColor.a);
          gl.uniform1i(mu.isBackFace, 1);
          gl.drawArrays(gl.TRIANGLES, idx * 3, 3);
        }
      }
      gl.bindVertexArray(null);
    }

    gl.disable(gl.BLEND);

    // ── Bloom pipeline ───────────────────────────────────────────

    const hw = IW >> 1, hh = IH >> 1;

    // Extract bright pixels
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO1.fb);
    gl.viewport(0, 0, hw, hh);
    gl.useProgram(bloomExtractProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex);
    gl.uniform1i(beu.scene, 0);
    gl.uniform1f(beu.threshold, 0.5);
    quad.draw();

    // Horizontal blur
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO2.fb);
    gl.useProgram(blurProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bloomFBO1.tex);
    gl.uniform1i(blu.tex, 0);
    gl.uniform2f(blu.direction, 1.0, 0.0);
    gl.uniform2f(blu.resolution, hw, hh);
    quad.draw();

    // Vertical blur
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO1.fb);
    gl.bindTexture(gl.TEXTURE_2D, bloomFBO2.tex);
    gl.uniform2f(blu.direction, 0.0, 1.0);
    quad.draw();

    // ── Composite to screen ──────────────────────────────────────

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(compositeProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex);
    gl.uniform1i(cu.scene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomFBO1.tex);
    gl.uniform1i(cu.bloom, 1);
    gl.uniform1f(cu.bloomStrength, 0.35);
    gl.uniform1f(cu.beat, beat);
    quad.draw();
  },

  destroy(gl) {
    if (meshProg) gl.deleteProgram(meshProg);
    if (groundProg) gl.deleteProgram(groundProg);
    if (bloomExtractProg) gl.deleteProgram(bloomExtractProg);
    if (blurProg) gl.deleteProgram(blurProg);
    if (compositeProg) gl.deleteProgram(compositeProg);
    if (quad) quad.destroy();
    if (g1VAO) {
      gl.deleteVertexArray(g1VAO.vao);
      gl.deleteBuffer(g1VAO.posBuf);
      gl.deleteBuffer(g1VAO.normBuf);
    }
    if (g2VAO) {
      gl.deleteVertexArray(g2VAO.vao);
      gl.deleteBuffer(g2VAO.posBuf);
      gl.deleteBuffer(g2VAO.normBuf);
    }
    if (checkerTex) gl.deleteTexture(checkerTex);
    if (sceneFBO) { gl.deleteFramebuffer(sceneFBO.fb); gl.deleteTexture(sceneFBO.tex); }
    if (bloomFBO1) { gl.deleteFramebuffer(bloomFBO1.fb); gl.deleteTexture(bloomFBO1.tex); }
    if (bloomFBO2) { gl.deleteFramebuffer(bloomFBO2.fb); gl.deleteTexture(bloomFBO2.tex); }
    meshProg = groundProg = bloomExtractProg = blurProg = compositeProg = null;
    quad = null;
    g1VAO = g2VAO = null;
    g1Mesh = g2Mesh = null;
    checkerTex = null;
    sceneFBO = bloomFBO1 = bloomFBO2 = null;
    checkerPal8 = null;
  },
};
