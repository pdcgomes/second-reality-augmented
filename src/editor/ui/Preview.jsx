import { useRef, useEffect } from 'react';

const INTERNAL_WIDTH = 320;
const INTERNAL_HEIGHT = 256;

export default function Preview() {
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas.getContext('webgl2', { antialias: false });
    if (!gl) {
      console.error('WebGL2 not supported');
      return;
    }
    glRef.current = gl;
    console.log('WebGL2 context initialized (editor preview)');

    gl.viewport(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
    gl.clearColor(0, 0, 0, 1);

    function frame() {
      gl.clear(gl.COLOR_BUFFER_BIT);
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={INTERNAL_WIDTH}
      height={INTERNAL_HEIGHT}
      className="border border-border"
      style={{
        width: INTERNAL_WIDTH * 3,
        height: INTERNAL_HEIGHT * 3,
        imageRendering: 'pixelated',
      }}
    />
  );
}
