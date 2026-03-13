import { resolveProject } from '../core/project.js';

const INTERNAL_WIDTH = 320;
const INTERNAL_HEIGHT = 256;
const ASPECT = INTERNAL_WIDTH / INTERNAL_HEIGHT;

function sizeCanvas(canvas) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let dw, dh;
  if (vw / vh > ASPECT) {
    dh = vh;
    dw = Math.round(vh * ASPECT);
  } else {
    dw = vw;
    dh = Math.round(vw / ASPECT);
  }
  const s = canvas.style;
  const w = dw + 'px';
  const h = dh + 'px';
  if (s.width !== w || s.height !== h) {
    s.position = 'absolute';
    s.left = ((vw - dw) >> 1) + 'px';
    s.top = ((vh - dh) >> 1) + 'px';
    s.width = w;
    s.height = h;
  }
}

async function main() {
  const canvas = document.getElementById('c');
  const gl = canvas.getContext('webgl2', { antialias: false });

  if (!gl) {
    document.body.textContent = 'WebGL2 is required.';
    return;
  }

  canvas.width = INTERNAL_WIDTH;
  canvas.height = INTERNAL_HEIGHT;
  gl.viewport(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
  gl.clearColor(0, 0, 0, 1);

  console.log('WebGL2 context initialized (player)');

  let project = null;
  try {
    project = await resolveProject();
    console.log(`Project loaded: ${project.clips?.length ?? 0} clips`);
  } catch (e) {
    console.warn('No project loaded, running blank:', e.message);
  }

  function frame() {
    sizeCanvas(canvas);
    gl.clear(gl.COLOR_BUFFER_BIT);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch(console.error);
