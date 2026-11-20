// WebGL Siri Wave shader engine with smooth morph transition between orb core and speech waveform.
const VERTEX_SHADER = `attribute vec2 aPos; void main(){ gl_Position=vec4(aPos,0.0,1.0); }`;

const WAVE_SHADER = `precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uProgress;
uniform float uVoice;
uniform vec3 uAccent;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uC4;

const float PI = 3.14159265359;
const float AMPLITUDE   = 0.44;
const float FREQ        = 1.15;
const float ABER_FREQ   = 1.05;
const float SPEED       = 2.2;
const float WAVE_SCALE  = 0.95;
const float ABERRATION  = 2.8;
const float THICKNESS   = 3.8;
const float INTENSITY   = 2.0;
const float FALLOFF     = 1.6;
const float EDGE_MASK   = 0.38;
const float EDGE_INSET  = 0.0;
const float BAND_FILL   = 34000.0;
const float BAND_THICK  = 0.075;
const float SOFTNESS    = 2.6;
const float LOW_AMP     = 6.2;
const float LOW_INT     = 1.5;
const float MID_ABER    = 0.8;
const float MID_ABAMP   = 0.06;
const float MID_BAND    = 22.0;
const float MID_SOFT    = 0.4;
const float HIGH_ABER   = 0.55;
const float HIGH_ABAMP  = 0.07;
const float UNRES_SCALE = 0.16;

vec3 spectral4(int s){
    float x = float(s);
    return clamp(vec3(abs(x-3.0)-1.0, 2.0-abs(x-2.0), 2.0-abs(x-4.0)), 0.0, 1.0);
}

vec3 ribbonColor(int s, float res) {
    vec3 spec = spectral4(s);
    vec3 artC = (s == 0) ? uC1 : ((s == 1) ? uC2 : ((s == 2) ? uC3 : uC4));
    vec3 c = mix(spec, artC, 0.45);
    c = mix(c, uAccent, 0.20);
    return mix(mix(artC, vec3(1.0), 0.4), c, res);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord){
    vec2 R = iResolution.xy;
    float aspect = R.x / R.y;
    vec2 p = (fragCoord + 0.5) * 2.0 / R - 1.0;
    p.x *= aspect;
    float yScreen = p.y;
    p /= max(WAVE_SCALE, 0.1);

    float t   = iTime;
    float low  = clamp(0.45 + 0.45*sin(t*0.8)*sin(t*0.37+1.0), 0.0, 1.0);
    float mid  = clamp(0.40 + 0.40*sin(t*1.7+2.0)*sin(t*0.53), 0.0, 1.0);
    float high = clamp(0.30 + 0.30*sin(t*2.9+4.0)*sin(t*0.71+2.0), 0.0, 1.0);

    float res   = clamp(uProgress, 0.0, 1.0);
    float drift = mod(t, 20.0*PI) * SPEED;

    float xN  = p.x / max(aspect, 1.0);
    float env = cos(PI*0.5 * min(abs(0.85*xN), 1.0));
    env *= env;

    float A1    = AMPLITUDE + 0.01*low*LOW_AMP;
    float A2    = A1 + mid*MID_ABAMP + high*HIGH_ABAMP;
    float AB    = (ABERRATION + mid*MID_ABER + high*HIGH_ABER)*res;
    float th    = mix(0.1, 0.01*THICKNESS, res);
    float inten = mix(0.1, 0.01*(INTENSITY + low*LOW_INT), res);
    float soft  = 0.01*res*max(0.0, SOFTNESS + mid*MID_SOFT);

    float dUnres = max(length(p) - mix(0.14, UNRES_SCALE, res), 0.0);
    float yMain = A1 * env * res * sin(p.x*FREQ + drift);

    float bandFillTh = max(BAND_THICK, 1e-4);
    float bandAmt    = 1e-4 * BAND_FILL * inten;
    vec3 num = vec3(0.0), den = vec3(0.0);
    for(int s = 0; s < 4; s++){
        vec3 hue = ribbonColor(s, res);
        den += hue;
        float ab = mix(-AB, AB, float(s)/3.0);
        float yL = A2 * env * res * sin(p.x*ABER_FREQ + drift + ab);
        float waveDist = abs(p.y - yL);
        float d = mix(dUnres, waveDist, smoothstep(0.05, 0.95, res));
        float lor = mix(1.0/(1.0 + (0.02*d)*(0.02*d)), 1.0, res);
        float line = inten / (sqrt(d*d + soft*soft) + th);
        float lo = min(yMain, yL), hi = max(yMain, yL);
        float dBand = max(0.0, max(p.y - hi, lo - p.y));
        float band  = bandAmt / (dBand + bandFillTh);
        num += hue * lor * (line + band);
    }
    vec3 col = num / den;

    float waveDistM = abs(p.y - yMain);
    float dM = mix(dUnres, waveDistM, smoothstep(0.05, 0.95, res));
    float lorM = mix(1.0/(1.0 + (0.02*dM)*(0.02*dM)), 1.0, res);
    float boost = (1.0 - res) * (14.0*low + 4.0);
    col += 0.5 * inten * (lorM + boost) / (sqrt(dM*dM + soft*soft) + th);

    // Luminous chromatic bloom during the uncoiling / recoiling phase
    float morphBurst = sin(res * PI);
    vec3 burstColor = mix(uC1, mix(uAccent, vec3(1.0), 0.5), 0.6);
    col += morphBurst * 0.42 * burstColor * exp(-length(p) * 2.2);

    col = pow(max(col, 0.0), vec3(1.4));
    float emT = clamp((abs(yScreen) - 1.0 + EDGE_INSET) / (-max(EDGE_MASK, 1e-4)), 0.0, 1.0);
    float em  = emT*emT*(3.0 - 2.0*emT);
    float gauss = exp(-pow(xN*FALLOFF, 2.0));
    col *= mix(1.0, em*gauss, res);

    float coreFade = smoothstep(0.0, 0.05, res);
    col *= coreFade;

    // Soft circular aperture vignette so it blends cleanly into the orb container
    float rCirc = length(p * 0.65);
    float circMask = smoothstep(1.0, 0.68, rCirc);
    float alpha = clamp(max(col.r, max(col.g, col.b)) * 3.5, 0.0, 1.0) * circMask * coreFade;
    fragColor = vec4(col, alpha);
}
void main(){ mainImage(gl_FragColor, gl_FragCoord.xy); }`;

export interface WaveRenderer {
  start(): void;
  stop(): void;
  morphTo(target: number, durationMs?: number, onComplete?: () => void): void;
  setVoiceIntensity(intensity: number): void;
  setAccent(r: number, g: number, b: number): void;
  setPalette(palette: [number, number, number][]): void;
  destroy(): void;
}

export function createWaveRenderer(canvas: HTMLCanvasElement): WaveRenderer | null {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: true });
  if (!gl) return null;

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      gl.deleteShader(s);
      return null;
    }
    return s;
  };

  const program = gl.createProgram();
  const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compile(gl.FRAGMENT_SHADER, WAVE_SHADER);
  if (!program || !vs || !fs) return null;

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uResolution = gl.getUniformLocation(program, "iResolution");
  const uTime = gl.getUniformLocation(program, "iTime");
  const uProgress = gl.getUniformLocation(program, "uProgress");
  const uVoice = gl.getUniformLocation(program, "uVoice");
  const uAccent = gl.getUniformLocation(program, "uAccent");
  const uC1 = gl.getUniformLocation(program, "uC1");
  const uC2 = gl.getUniformLocation(program, "uC2");
  const uC3 = gl.getUniformLocation(program, "uC3");
  const uC4 = gl.getUniformLocation(program, "uC4");

  const dim = 160;
  canvas.width = dim;
  canvas.height = dim;
  gl.viewport(0, 0, dim, dim);

  let raf = 0;
  let running = false;
  let morphProgress = 0.0;
  let morphTarget = 0.0;
  let morphStart = 0.0;
  let morphStartTime = 0;
  let morphDuration = 600;
  let morphOnComplete: (() => void) | null = null;
  let voiceIntensity = 0.0;
  let accentR = 1.0, accentG = 0.5, accentB = 0.2;
  let c1 = [0.95, 0.45, 0.3], c2 = [0.35, 0.85, 0.7], c3 = [0.3, 0.65, 0.95], c4 = [0.8, 0.45, 0.9];
  const startT = performance.now();

  const frame = () => {
    if (!running || document.hidden) return;
    const now = performance.now();
    const t = (now - startT) / 1000;

    if (morphStartTime > 0) {
      const elapsed = now - morphStartTime;
      const p = Math.min(1, elapsed / morphDuration);
      const eased = 1 - Math.pow(1 - p, 3);
      morphProgress = morphStart + (morphTarget - morphStart) * eased;
      if (p >= 1) {
        morphProgress = morphTarget;
        morphStartTime = 0;
        const cb = morphOnComplete;
        morphOnComplete = null;
        cb?.();
        if (morphTarget === 0) {
          running = false;
          cancelAnimationFrame(raf);
          raf = 0;
          return;
        }
      }
    }

    gl.uniform2f(uResolution, dim, dim);
    gl.uniform1f(uTime, t);
    gl.uniform1f(uProgress, morphProgress);
    gl.uniform1f(uVoice, voiceIntensity);
    gl.uniform3f(uAccent, accentR, accentG, accentB);
    gl.uniform3f(uC1, c1[0], c1[1], c1[2]);
    gl.uniform3f(uC2, c2[0], c2[1], c2[2]);
    gl.uniform3f(uC3, c3[0], c3[1], c3[2]);
    gl.uniform3f(uC4, c4[0], c4[1], c4[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(frame);
  };

  const onVisibility = () => {
    if (!document.hidden && running && !raf) {
      raf = requestAnimationFrame(frame);
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  return {
    start() {
      if (running) return;
      running = true;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
      morphProgress = 0.0;
      morphTarget = 0.0;
      morphStartTime = 0;
    },
    morphTo(target: number, durationMs = 600, onComplete?: () => void) {
      target = Math.max(0, Math.min(1, target));
      morphTarget = target;
      morphStart = morphProgress;
      morphStartTime = performance.now();
      morphDuration = durationMs;
      morphOnComplete = onComplete ?? null;
      if (!running) {
        running = true;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(frame);
      }
    },
    setVoiceIntensity(intensity: number) {
      voiceIntensity = Math.max(0, Math.min(1, intensity));
    },
    setAccent(r: number, g: number, b: number) {
      accentR = r;
      accentG = g;
      accentB = b;
    },
    setPalette(palette: [number, number, number][]) {
      if (palette[0]) c1 = palette[0];
      if (palette[1]) c2 = palette[1];
      if (palette[2]) c3 = palette[2];
      if (palette[3]) c4 = palette[3];
    },
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (buffer) gl.deleteBuffer(buffer);
    }
  };
}
