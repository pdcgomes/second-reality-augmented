import { resolveProject } from '../core/project.js';

const INTERNAL_WIDTH = 320;
const INTERNAL_HEIGHT = 256;

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
    gl.clear(gl.COLOR_BUFFER_BIT);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch(console.error);
