// Analytic mirror ball: one quad around the ball (no full-screen fragment work) and the
// reflected light spots as GPU point sprites. Nothing is allocated per frame.

const BALL_VS = `
attribute vec2 a;
uniform vec2 uC, uRes;
uniform float uR;
varying vec2 vP;
const float HALO = 1.8;
void main() {
  vP = a * HALO;
  vec2 px = uC + a * uR * HALO;
  gl_Position = vec4(px / uRes * vec2(2, -2) + vec2(-1, 1), 0, 1);
}`;

const BALL_FS = `
precision highp float;
varying vec2 vP;
uniform mat3 uM;
uniform float uT, uFacet, uKick, uPx, uGlow;
uniform vec3 uC1, uC2, uC3, uC4;
const float PI = 3.14159265;
const float ROWS = 26.0;
const vec3 KEY = vec3(0.24, 0.86, 0.45);

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

vec3 room(vec3 r) {
  // Silver studio: bright ceiling, dim floor, the orb's colours as coloured washes.
  vec3 c = mix(vec3(0.05, 0.05, 0.065), vec3(0.42, 0.42, 0.46), smoothstep(-0.6, 0.9, r.y));
  c += uC1 * pow(max(dot(r, normalize(vec3(-0.7, 0.4, 0.6))), 0.0), 6.0) * 1.3;
  c += uC2 * pow(max(dot(r, normalize(vec3(0.75, 0.25, 0.55))), 0.0), 6.0) * 1.3;
  c += uC3 * pow(max(dot(r, normalize(vec3(0.05, -0.7, 0.7))), 0.0), 5.0) * 0.9;
  c += uC4 * pow(max(dot(r, normalize(vec3(-0.2, 0.1, -0.9))), 0.0), 4.0) * 0.7;
  c += vec3(1.0, 0.97, 0.92) * pow(max(dot(r, KEY), 0.0), 90.0) * (5.0 + uKick * 6.0);
  return c;
}

void main() {
  float d = length(vP);
  vec3 glowC = mix(uC1, uC3, 0.5);
  if (d > 1.0) {
    float g = exp(-(d - 1.0) * 5.0) * uGlow * (0.35 + uKick * 0.35);
    gl_FragColor = vec4(glowC * g, g * 0.6);
    return;
  }
  vec3 n = vec3(vP, sqrt(1.0 - d * d));
  vec3 o = n * uM; // view -> ball space

  float lat = asin(clamp(o.y, -1.0, 1.0));
  float lon = atan(o.z, o.x);
  float bh = PI / ROWS;
  float row = floor((lat + PI * 0.5) / bh);
  float latC = (row + 0.5) * bh - PI * 0.5;
  float cols = max(4.0, floor(ROWS * 2.0 * cos(latC) + 0.5));
  float bw = 2.0 * PI / cols;
  float col = floor((lon + PI) / bw);
  float lonC = (col + 0.5) * bw - PI;
  float id = hash(vec2(row, col));

  vec3 tn = vec3(cos(latC) * cos(lonC), sin(latC), cos(latC) * sin(lonC));
  tn = normalize(tn + (vec3(id, hash(vec2(col, row)), fract(id * 7.13)) - 0.5) * 0.035);
  vec3 vn = uM * tn;
  vec3 r = reflect(vec3(0.0, 0.0, -1.0), vn);
  vec3 mirror = room(r) * (0.45 + 0.85 * id * id) + 0.03;
  mirror += vec3(1.0) * pow(max(dot(r, KEY), 0.0), 900.0) * 30.0 * (0.5 + id);

  // Grout: distance to the tile edge in tile units, widened near the limb to stay anti-aliased.
  vec2 cell = abs(fract(vec2((lat + PI * 0.5) / bh, (lon + PI) / bw)) - 0.5);
  float aa = uPx * 14.0 / max(n.z, 0.15);
  float grout = smoothstep(0.5 - 0.06 - aa, 0.5 - 0.02, max(cell.x, cell.y));

  // The CSS orb's look: drifting colour field, soft rim.
  float s = sin(o.x * 3.0 + uT * 0.7) + sin(o.y * 4.0 - uT * 0.5) + sin(o.z * 3.5 + uT * 0.9);
  vec3 orb = mix(mix(uC2, uC1, 0.5 + 0.5 * sin(s)), mix(uC3, uC4, 0.5 + 0.5 * cos(s * 1.3)), 0.5 + 0.5 * o.y);
  orb *= 0.75 + 0.35 * n.z;
  orb += glowC * pow(1.0 - n.z, 3.0) * 0.6;

  // Tiles crystallise top-down with jitter; each flashes as it flips.
  float th = 0.1 + 0.55 * (0.5 - latC / PI) + 0.3 * id;
  float on = smoothstep(th - 0.06, th + 0.06, uFacet * 1.05);
  float flash = on * (1.0 - on) * 4.0;
  vec3 tile = mix(mirror, vec3(0.02), grout) + vec3(1.0, 0.95, 0.9) * flash * 0.8;
  vec3 c = mix(orb, tile, on) * (1.0 + uKick * 0.25);
  c *= mix(1.0, 0.55 + 0.45 * n.z, on); // limb darkening on the metal

  c = 1.0 - exp(-c * 1.15);
  float a = smoothstep(1.0, 1.0 - uPx * 1.5, d);
  float g = exp(-(d - 1.0) * 5.0) * uGlow * 0.35;
  gl_FragColor = vec4(c * a + glowC * g * (1.0 - a), max(a, g * 0.6));
}`;

const SPOT_VS = `
attribute vec3 aN;
attribute float aS;
uniform mat3 uM;
uniform vec2 uC, uRes;
uniform float uSpread, uOn, uKick, uDpr, uR, uT, uMode;
varying float vI;
varying float vS;
const vec3 LIGHT = vec3(0.24, 0.86, 0.45);
void main() {
  vec3 n = uM * aN;
  if (uMode > 0.5) {
    // Star glints where a tile catches the key light toward the viewer.
    vI = pow(max(dot(n, normalize(LIGHT + vec3(0, 0, 1))), 0.0), 40.0) * uOn * step(0.0, n.z)
      * (0.5 + 0.5 * sin(uT * 7.0 + aS * 60.0));
    vS = -1.0;
    vec2 at = uC + vec2(n.x, -n.y) * uR;
    gl_Position = vI > 0.01 ? vec4(at / uRes * vec2(2, -2) + vec2(-1, 1), 0, 1) : vec4(2, 2, 2, 1);
    gl_PointSize = 26.0 * uDpr * (0.6 + vI);
    return;
  }
  vec3 r = reflect(-LIGHT, n);
  float lit = max(dot(n, LIGHT), 0.0);
  vI = sqrt(lit) * smoothstep(0.1, 0.4, r.z) * uOn * (0.6 + 0.4 * fract(aS * 13.7)) * (0.75 + uKick * 0.7);
  vS = aS;
  vec2 px = uC + vec2(r.x, -r.y) / r.z * uSpread;
  gl_Position = vI > 0.002 ? vec4(px / uRes * vec2(2, -2) + vec2(-1, 1), 0, 1) : vec4(2, 2, 2, 1);
  gl_PointSize = (9.0 + 22.0 * aS * aS) * uDpr * (1.0 + uKick * 0.2);
}`;

const SPOT_FS = `
precision mediump float;
varying float vI;
varying float vS;
uniform vec3 uC1, uC2;
void main() {
  vec2 p = abs(gl_PointCoord - 0.5) * 2.0;
  if (vS < 0.0) {
    float star = exp(-p.x * 22.0) * exp(-p.y * 2.5) + exp(-p.y * 22.0) * exp(-p.x * 2.5) + exp(-dot(p, p) * 18.0);
    gl_FragColor = vec4(vec3(1.0, 0.98, 0.95) * star * vI * 1.6, 0.0);
    return;
  }
  float d = length(p);
  float core = smoothstep(0.8, 0.3, d);
  float halo = smoothstep(1.0, 0.0, d);
  vec3 tint = vS < 0.55 ? vec3(1.0, 0.97, 0.92) : (vS < 0.8 ? uC1 : uC2);
  float a = (core * 1.5 + halo * halo * 0.5) * vI;
  gl_FragColor = vec4(mix(tint, vec3(1.0), core * 0.5) * a, 0.0);
}`;

const SPOTS = 320;

export interface Frame {
  cx: number; cy: number; r: number; // canvas px
  rot: number; t: number; facet: number; kick: number; spots: number; glow: number; dim: number;
}

export type Colours = [number, number, number][];

function program(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
  return p;
}

function spotData(): Float32Array {
  const out: number[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < SPOTS; i++) {
    const y = rnd() * 2 - 1;
    const a = rnd() * Math.PI * 2;
    const k = Math.sqrt(1 - y * y);
    out.push(k * Math.cos(a), y, k * Math.sin(a), rnd());
  }
  return new Float32Array(out);
}

export function createDisco(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) return null;
  const ball = program(gl, BALL_VS, BALL_FS);
  const spot = program(gl, SPOT_VS, SPOT_FS);
  const u = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const spots = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, spots);
  gl.bufferData(gl.ARRAY_BUFFER, spotData(), gl.STATIC_DRAW);
  const aQuad = gl.getAttribLocation(ball, "a");
  const aN = gl.getAttribLocation(spot, "aN");
  const aS = gl.getAttribLocation(spot, "aS");
  const m = new Float32Array(9);
  gl.enable(gl.BLEND);

  let colours: Colours = [];
  const setColours = (p: WebGLProgram) =>
    ["uC1", "uC2", "uC3", "uC4"].forEach((n, i) => colours[i] && gl.uniform3fv(u(p, n), colours[i]));

  return {
    colours(c: Colours) {
      colours = c;
      gl.useProgram(ball);
      setColours(ball);
      gl.useProgram(spot);
      setColours(spot);
    },
    draw(f: Frame, dpr: number) {
      const { width: w, height: h } = canvas;
      // Ball tilted 0.35 rad toward the viewer, spinning about its own vertical axis.
      const [cr, sr, ct, st] = [Math.cos(f.rot), Math.sin(f.rot), Math.cos(0.35), Math.sin(0.35)];
      m.set([cr, st * sr, -ct * sr, 0, ct, st, sr, -st * cr, ct * cr]);

      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, f.dim);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(ball);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform2f(u(ball, "uC"), f.cx, f.cy);
      gl.uniform2f(u(ball, "uRes"), w, h);
      gl.uniform1f(u(ball, "uR"), f.r);
      gl.uniform1f(u(ball, "uPx"), 1 / f.r);
      gl.uniformMatrix3fv(u(ball, "uM"), false, m);
      gl.uniform1f(u(ball, "uT"), f.t);
      gl.uniform1f(u(ball, "uFacet"), f.facet);
      gl.uniform1f(u(ball, "uKick"), f.kick);
      gl.uniform1f(u(ball, "uGlow"), f.glow);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(aQuad);
      gl.vertexAttribPointer(aQuad, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disableVertexAttribArray(aQuad);

      if (f.spots <= 0 && f.facet <= 0) return;
      gl.useProgram(spot);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniformMatrix3fv(u(spot, "uM"), false, m);
      gl.uniform2f(u(spot, "uC"), f.cx, f.cy);
      gl.uniform2f(u(spot, "uRes"), w, h);
      gl.uniform1f(u(spot, "uSpread"), Math.max(w, h) * 0.32);
      gl.uniform1f(u(spot, "uOn"), f.spots);
      gl.uniform1f(u(spot, "uKick"), f.kick);
      gl.uniform1f(u(spot, "uDpr"), dpr);
      gl.uniform1f(u(spot, "uR"), f.r);
      gl.uniform1f(u(spot, "uT"), f.t);
      gl.uniform1f(u(spot, "uMode"), 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, spots);
      gl.enableVertexAttribArray(aN);
      gl.enableVertexAttribArray(aS);
      gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 16, 0);
      gl.vertexAttribPointer(aS, 1, gl.FLOAT, false, 16, 12);
      gl.drawArrays(gl.POINTS, 0, SPOTS);
      gl.uniform1f(u(spot, "uMode"), 1);
      gl.uniform1f(u(spot, "uOn"), f.facet);
      gl.drawArrays(gl.POINTS, 0, SPOTS);
      gl.disableVertexAttribArray(aN);
      gl.disableVertexAttribArray(aS);
    },
  };
}
