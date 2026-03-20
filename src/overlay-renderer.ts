import './overlay.css';

declare global {
  interface Window {
    overlayBridge: {
      onStateChange: (callback: (event: unknown, state: string) => void) => void;
      onAudioLevel: (callback: (event: unknown, level: number) => void) => void;
    };
  }
}

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

if (!gl) {
  console.error('WebGL not supported');
}

let currentState = 'recording';
let currentAudioLevel = 0;
let smoothedLevel = 0;
let animationId: number | null = null;

const vertexShaderSrc = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentShaderSrc = `
  precision highp float;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_mode;       // 0.0 = recording, 1.0 = transcribing
  uniform float u_audioLevel; // 0.0 - 1.0, audio reactivity

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;

    // Audio-reactive border thickness
    float baseThickness = 0.006;
    float maxExtraThickness = 0.045;
    float baseGlow = 0.025;
    float maxExtraGlow = 0.18;

    float audioInfluence = u_audioLevel;
    float borderThickness = baseThickness + maxExtraThickness * audioInfluence;
    float glowFalloff = baseGlow + maxExtraGlow * audioInfluence;

    // Distance from each edge
    float distLeft = uv.x;
    float distRight = 1.0 - uv.x;
    float distTop = 1.0 - uv.y;
    float distBottom = uv.y;
    float minDist = min(min(distLeft, distRight), min(distTop, distBottom));

    // Glow intensity
    float glow = smoothstep(glowFalloff, 0.0, minDist);
    float edge = smoothstep(borderThickness + 0.002, borderThickness, minDist);
    glow = max(glow * 0.5, edge);

    // Gentle intensity boost with audio
    float intensityBoost = 1.0 + audioInfluence * 0.4;
    glow *= intensityBoost;

    if (glow < 0.001) {
      gl_FragColor = vec4(0.0);
      return;
    }

    // Position along border perimeter
    float angle;
    if (distBottom <= minDist + 0.001) {
      angle = uv.x;
    } else if (distRight <= minDist + 0.001) {
      angle = 1.0 + uv.y;
    } else if (distTop <= minDist + 0.001) {
      angle = 2.0 + (1.0 - uv.x);
    } else {
      angle = 3.0 + (1.0 - uv.y);
    }
    angle /= 4.0;

    // Very slow, steady rotation — use mod to keep time small and avoid float precision issues
    float wrappedTime = mod(u_time, 1000.0);
    float speed = u_mode < 0.5 ? 0.03 : 0.15;
    float colorShift = angle + wrappedTime * speed;

    vec3 color;
    if (u_mode < 0.5) {
      // Recording: vibrant colors
      vec3 c1 = vec3(0.6, 0.1, 0.9);  // purple
      vec3 c2 = vec3(0.1, 0.4, 1.0);  // blue
      vec3 c3 = vec3(0.0, 0.8, 0.9);  // cyan
      vec3 c4 = vec3(1.0, 0.2, 0.6);  // magenta
      vec3 c5 = vec3(1.0, 0.5, 0.0);  // orange

      float t = fract(colorShift) * 5.0;
      if (t < 1.0) color = mix(c1, c2, t);
      else if (t < 2.0) color = mix(c2, c3, t - 1.0);
      else if (t < 3.0) color = mix(c3, c4, t - 2.0);
      else if (t < 4.0) color = mix(c4, c5, t - 3.0);
      else color = mix(c5, c1, t - 4.0);
    } else {
      // Transcribing: warm orange/yellow pulse
      vec3 c1 = vec3(1.0, 0.6, 0.0);
      vec3 c2 = vec3(1.0, 0.85, 0.2);
      float pulse = sin(wrappedTime * 2.0) * 0.5 + 0.5;
      color = mix(c1, c2, pulse);
    }

    // Edge brightness boost
    color = color * (1.0 + edge * 0.3);

    float alpha = min(glow * 0.75, 1.0);
    gl_FragColor = vec4(color, alpha);
  }
`;

function createShader(glCtx: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = glCtx.createShader(type);
  if (!shader) return null;
  glCtx.shaderSource(shader, source);
  glCtx.compileShader(shader);
  if (!glCtx.getShaderParameter(shader, glCtx.COMPILE_STATUS)) {
    console.error('Shader compile error:', glCtx.getShaderInfoLog(shader));
    glCtx.deleteShader(shader);
    return null;
  }
  return shader;
}

// --- Edge canvas (white border, no blur) ---
const edgeCanvas = document.getElementById('edgeCanvas') as HTMLCanvasElement;
const edgeGl = edgeCanvas.getContext('webgl2') || edgeCanvas.getContext('webgl');

const edgeFragmentShaderSrc = `
  precision highp float;
  uniform vec2 u_resolution;

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;

    // Distance from each edge
    float distLeft = uv.x;
    float distRight = 1.0 - uv.x;
    float distTop = 1.0 - uv.y;
    float distBottom = uv.y;
    float minDist = min(min(distLeft, distRight), min(distTop, distBottom));

    // White line: ~8px thick at the very edge
    float pixelSize = 1.0 / max(u_resolution.x, u_resolution.y);
    float lineWidth = pixelSize * 8.0;
    float line = smoothstep(lineWidth + pixelSize * 2.0, lineWidth, minDist);

    // Soft glow extending inward from the line
    float glowWidth = pixelSize * 40.0;
    float glowVal = smoothstep(glowWidth, 0.0, minDist) * 0.35;

    float intensity = max(line * 0.9, glowVal);

    if (intensity < 0.001) {
      gl_FragColor = vec4(0.0);
      return;
    }

    gl_FragColor = vec4(1.0, 1.0, 1.0, intensity);
  }
`;

function initGLProgram(glCtx: WebGLRenderingContext, fragSrc: string) {
  const vertexShader = createShader(glCtx, glCtx.VERTEX_SHADER, vertexShaderSrc);
  const fragmentShader = createShader(glCtx, glCtx.FRAGMENT_SHADER, fragSrc);
  if (!vertexShader || !fragmentShader) return null;

  const program = glCtx.createProgram()!;
  glCtx.attachShader(program, vertexShader);
  glCtx.attachShader(program, fragmentShader);
  glCtx.linkProgram(program);

  if (!glCtx.getProgramParameter(program, glCtx.LINK_STATUS)) {
    console.error('Program link error:', glCtx.getProgramInfoLog(program));
    return null;
  }

  const buffer = glCtx.createBuffer();
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, buffer);
  glCtx.bufferData(glCtx.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1,  -1, 1,
    -1,  1,  1, -1,   1, 1,
  ]), glCtx.STATIC_DRAW);

  const posLoc = glCtx.getAttribLocation(program, 'a_position');
  glCtx.enableVertexAttribArray(posLoc);
  glCtx.vertexAttribPointer(posLoc, 2, glCtx.FLOAT, false, 0, 0);

  return program;
}

function startAnimation() {
  if (!gl || animationId) return;

  const dpr = window.devicePixelRatio;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  gl.viewport(0, 0, canvas.width, canvas.height);

  const mainProgram = initGLProgram(gl, fragmentShaderSrc);
  if (!mainProgram) return;

  const mainUniforms = {
    resolution: gl.getUniformLocation(mainProgram, 'u_resolution'),
    time: gl.getUniformLocation(mainProgram, 'u_time'),
    mode: gl.getUniformLocation(mainProgram, 'u_mode'),
    audioLevel: gl.getUniformLocation(mainProgram, 'u_audioLevel'),
  };

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // Edge canvas setup
  let edgeProgram: WebGLProgram | null = null;
  let edgeResolutionLoc: WebGLUniformLocation | null = null;
  if (edgeGl) {
    edgeCanvas.width = window.innerWidth * dpr;
    edgeCanvas.height = window.innerHeight * dpr;
    edgeGl.viewport(0, 0, edgeCanvas.width, edgeCanvas.height);

    edgeProgram = initGLProgram(edgeGl, edgeFragmentShaderSrc);
    if (edgeProgram) {
      edgeResolutionLoc = edgeGl.getUniformLocation(edgeProgram, 'u_resolution');
      edgeGl.enable(edgeGl.BLEND);
      edgeGl.blendFunc(edgeGl.SRC_ALPHA, edgeGl.ONE_MINUS_SRC_ALPHA);
    }
  }

  const startTime = performance.now();

  function render() {
    if (!gl) return;
    const time = (performance.now() - startTime) / 1000;

    // Very smooth audio level interpolation to avoid flickering
    smoothedLevel += (currentAudioLevel - smoothedLevel) * 0.06;

    // Main color glow canvas (blurred via CSS)
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(mainProgram);

    gl.uniform2f(mainUniforms.resolution, canvas.width, canvas.height);
    gl.uniform1f(mainUniforms.time, time);
    gl.uniform1f(mainUniforms.mode, currentState === 'transcribing' ? 1.0 : 0.0);
    gl.uniform1f(mainUniforms.audioLevel, smoothedLevel);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Edge white line canvas (sharp, no blur)
    if (edgeGl && edgeProgram) {
      edgeGl.clearColor(0, 0, 0, 0);
      edgeGl.clear(edgeGl.COLOR_BUFFER_BIT);
      edgeGl.useProgram(edgeProgram);

      edgeGl.uniform2f(edgeResolutionLoc, edgeCanvas.width, edgeCanvas.height);
      edgeGl.drawArrays(edgeGl.TRIANGLES, 0, 6);
    }

    animationId = requestAnimationFrame(render);
  }

  render();
}

function stopAnimation() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  if (gl) {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  if (edgeGl) {
    edgeGl.clearColor(0, 0, 0, 0);
    edgeGl.clear(edgeGl.COLOR_BUFFER_BIT);
  }
}

window.overlayBridge.onStateChange((_event: unknown, state: string) => {
  currentState = state;
  if (state === 'hidden') {
    stopAnimation();
  } else {
    if (!animationId) startAnimation();
  }
});

window.overlayBridge.onAudioLevel((_event: unknown, level: number) => {
  currentAudioLevel = level;
});

startAnimation();
