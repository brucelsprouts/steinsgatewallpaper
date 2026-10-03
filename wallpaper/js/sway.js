'use strict';
// Sway: brings the Makise picture to life on the GPU, in three layers cut from it by its
// rig (made by tools/swaymap.py). The hair swings and ripples on a layer of its own; the
// jacket, with her arms in it, swings from the shoulders on another, its loose cuffs and
// hem fluttering; beneath them her body breathes, filled in where the two were lifted off
// it, so whatever swings aside uncovers something and nothing else is dragged along.
//
// WebGL won't take a picture the browser counts as foreign (as a local file can be),
// and may be missing altogether; then there is no sway and the picture is drawn still.
const Sway = (() => {
  const VERT = `
attribute vec2 a;
varying vec2 uv;
void main() {
  uv = vec2(a.x, 1.0 - a.y);
  gl_Position = vec4(a * 2.0 - 1.0, 0.0, 1.0);
}`;
  const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 uv;
uniform sampler2D pic, under, layers, sway;
uniform vec2 size;       // the picture, in design px
uniform vec4 shoulders;  // where the arms hang from, left then right (design px)
uniform vec2 chest;      // rows (uv) over which the body stops riding the breath
uniform float fade;      // how much of the height dissolves at the bottom
uniform vec2 hair;       // how far the hair has swung, at full weight (design px)
uniform vec3 ph;         // phases of the ripples down the hair and of the flutter
uniform float wind;      // how far the ripples run (design px)
uniform float breath;    // how far the shoulders have risen (design px)
uniform vec2 swing;      // the arms' angles, left and right (radians)
uniform vec2 loose;      // how far loose cloth trails (design px)
uniform float flutter;   // how far it flutters (design px)
void main() {
  vec2 q = uv * size;
  vec3 s = texture2D(sway, uv).rgb;
  // She breathes: the head, hair and arms ride the shoulders; below them the body eases
  // off to nothing at the waist.
  vec2 lift = vec2(0.0, -breath);
  vec2 ub = uv - lift * (1.0 - smoothstep(chest.x, chest.y, uv.y)) / size;
  // Hair: ripples run down the locks, each a little out of step with its neighbours.
  float r = q.y * 0.021 - ph.x + sin(q.x * 0.05 + ph.y) * 1.4;
  vec2 h = hair + vec2(sin(r), 0.3 * cos(r * 0.7)) * wind;
  h.y -= 0.2 * abs(h.x); // a lock swung out rises a little
  vec2 uh = uv - (lift + s.r * h) / size;
  // Jacket and arms: each side swings from its shoulder; loose cloth trails and flutters.
  vec2 a = q - shoulders.xy, b = q - shoulders.zw;
  float right = smoothstep(-20.0, 20.0, q.x - 0.5 * (shoulders.x + shoulders.z));
  vec2 sw = mix(swing.x * vec2(-a.y, a.x), swing.y * vec2(-b.y, b.x), right);
  float f = sin(q.y * 0.017 + q.x * 0.009 - ph.z);
  vec2 uj = uv - (lift + s.g * sw + s.b * (loose + vec2(f, 0.3 * f) * flutter)) / size;
  // Each layer cut out by its own matte, over the body filled in where they were.
  vec4 H = texture2D(pic, uh) * texture2D(layers, uh).r;
  vec4 J = texture2D(pic, uj) * texture2D(layers, uj).g;
  vec4 B = mix(texture2D(pic, ub), texture2D(under, ub), texture2D(layers, ub).b);
  vec4 c = H + (1.0 - H.a) * (J + (1.0 - J.a) * B);
  gl_FragColor = c * (1.0 - smoothstep(1.0 - fade, 1.0, uv.y));
}`;
  const TEXTURES = ['pic', 'under', 'layers', 'sway'];

  class Warp {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.gl = null;
      this.ok = false; // a rigged picture is in and drawable
      this.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.ok = false; this.gl = null; });
    }

    // The GL context and program, made once. False if there's no WebGL.
    init() {
      if (this.gl) return true;
      const gl = this.canvas.getContext('webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
      if (!gl) return false;
      const shader = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const p = gl.createProgram();
      gl.attachShader(p, shader(gl.VERTEX_SHADER, VERT));
      gl.attachShader(p, shader(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      gl.useProgram(p);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
      const a = gl.getAttribLocation(p, 'a');
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      this.u = {};
      const names = [...TEXTURES, 'size', 'shoulders', 'chest', 'fade', 'hair', 'ph', 'wind', 'breath', 'swing', 'loose', 'flutter'];
      for (const n of names) this.u[n] = gl.getUniformLocation(p, n);
      this.tex = TEXTURES.map((n, i) => { gl.uniform1i(this.u[n], i); return gl.createTexture(); });
      gl.clearColor(0, 0, 0, 0);
      this.gl = gl;
      return true;
    }

    // Take the rigged picture: canvases of the picture and what's under its hair and
    // jacket (graded alike), and of its layers and sway (all covering the same part of
    // it, at any size); and `fit`: its size, where the shoulders are (design px), the
    // rows the breath eases off over and the fade (fractions of its height). The result
    // is drawn at the picture canvas's size. False if they can't be used.
    set(t, fit) {
      this.ok = false;
      try {
        if (!this.init()) return false;
        const gl = this.gl;
        this.canvas.width = t.pic.width;
        this.canvas.height = t.pic.height;
        gl.viewport(0, 0, t.pic.width, t.pic.height);
        TEXTURES.forEach((n, i) => {
          gl.activeTexture(gl.TEXTURE0 + i);
          gl.bindTexture(gl.TEXTURE_2D, this.tex[i]);
          // Pictures go in premultiplied, so their soft edges filter without dark fringes.
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, n === 'pic' || n === 'under');
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, t[n]);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        });
        const u = this.u, [l, r] = fit.shoulders;
        gl.uniform2f(u.size, fit.w, fit.h);
        gl.uniform4f(u.shoulders, l[0], l[1], r[0], r[1]);
        gl.uniform2f(u.chest, fit.chest[0], fit.chest[1]);
        gl.uniform1f(u.fade, fit.fade);
        this.ok = gl.getError() === gl.NO_ERROR;
      } catch (e) {
        this.ok = false; // a foreign picture, or a shader the GPU won't take
      }
      return this.ok;
    }

    // Draw a moment: `m` holds the hair's swing ({x, y}), the ripple and flutter phases,
    // the wind, the breath, the arms' swing ([left, right] radians), the loose cloth's
    // trail ({x, y}) and flutter. Returns the canvas it's drawn on, or null.
    draw(m) {
      if (!this.ok) return null;
      const gl = this.gl, u = this.u;
      gl.uniform2f(u.hair, m.hair.x, m.hair.y);
      gl.uniform3f(u.ph, m.ph[0], m.ph[1], m.ph[2]);
      gl.uniform1f(u.wind, m.wind);
      gl.uniform1f(u.breath, m.breath);
      gl.uniform2f(u.swing, m.swing[0], m.swing[1]);
      gl.uniform2f(u.loose, m.loose.x, m.loose.y);
      gl.uniform1f(u.flutter, m.flutter);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return this.canvas;
    }
  }

  return { Warp };
})();
