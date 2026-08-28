import {useEffect, useRef} from 'react';

const vertex = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const fragment = `
precision highp float;
uniform vec2 resolution;
uniform float time;
uniform float energy;
uniform float presence;
uniform float pulse;
uniform float phase;

float blob(vec2 p, vec2 c, float r) {
  return r / max(dot(p - c, p - c), 0.025);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
  float t = time * (0.10 + energy * 0.035);
  vec2 a = vec2(sin(t * 1.07) * .72, cos(t * .73) * .52);
  vec2 b = vec2(cos(t * .61 + 2.2) * .86, sin(t * .92 + .8) * .62);
  vec2 c = vec2(sin(t * .48 + 4.1) * .60, cos(t * 1.12 + 1.3) * .82);
  vec2 d = vec2(cos(t * .81 + 5.3) * .45, sin(t * .57 + 3.4) * .48);
  float social = min(presence, 6.0) * .008;
  float field = blob(uv, a, .105 + social) + blob(uv, b, .14) + blob(uv, c, .09 + social) + blob(uv, d, .075);
  float veil = smoothstep(.58, 1.65, field);
  float core = smoothstep(1.15, 3.1, field);
  vec3 ink = vec3(.055, .025, .14);
  vec3 violet = mix(vec3(.32, .12, .84), vec3(.07, .46, .64), phase);
  vec3 coral = mix(vec3(1.0, .25, .28), vec3(.30, .82, .76), phase);
  vec3 cream = vec3(1.0, .68, .47);
  vec3 color = mix(ink, violet, veil);
  color = mix(color, coral, core * .86);
  color = mix(color, cream, smoothstep(2.3, 5.4, field) * (.5 + pulse * .35));
  color += .035 * sin(uv.y * 2.4 + t) + (hash(gl_FragCoord.xy + time) - .5) * .028;
  float vignette = 1.0 - smoothstep(.8, 1.72, length(uv * vec2(.72, .56)));
  gl_FragColor = vec4(color * (.72 + vignette * .34), 1.0);
}
`;

const compile = (gl: WebGLRenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader error');
  return shader;
};

export function LavaShader({energy, presence, pulse, phase}: {energy: number; presence: number; pulse: number; phase: number}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const values = useRef({energy, presence, pulse, phase});
  values.current = {energy, presence, pulse, phase};

  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext('webgl', {antialias: false, alpha: false});
    if (!gl) return;
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const resolution = gl.getUniformLocation(program, 'resolution');
    const time = gl.getUniformLocation(program, 'time');
    const power = gl.getUniformLocation(program, 'energy');
    const people = gl.getUniformLocation(program, 'presence');
    const bloom = gl.getUniformLocation(program, 'pulse');
    const phaseUniform = gl.getUniformLocation(program, 'phase');
    let frame = 0;

    const draw = (timestamp: number) => {
      if (document.visibilityState === 'hidden') {
        frame = requestAnimationFrame(draw);
        return;
      }
      const ratio = Math.min(window.devicePixelRatio, window.innerWidth < 720 ? 1.1 : 1.4);
      const width = Math.floor(canvas.clientWidth * ratio);
      const height = Math.floor(canvas.clientHeight * ratio);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
      gl.uniform2f(resolution, width, height);
      gl.uniform1f(time, timestamp / 1000);
      gl.uniform1f(power, values.current.energy);
      gl.uniform1f(people, values.current.presence);
      gl.uniform1f(bloom, values.current.pulse);
      gl.uniform1f(phaseUniform, values.current.phase);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={canvasRef} className="lava" aria-hidden="true" />;
}
