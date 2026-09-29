import Phaser from "phaser";
import type { LivingFrame, LivingRig } from "./livingArt";

/**
 * WebGL post-FX that makes a finished puzzle picture "come alive": the real
 * artwork is smoothly warped through a small hierarchy of soft regions (body →
 * head → ears/tail/wings, plus swaying plants), and eyes are closed by painting
 * a lid in fur colour sampled from just above them. One continuous warp — no
 * cut-out copies layered over the picture — so nothing ghosts or doubles.
 *
 * Coordinates arrive as image fractions; `setImageRect` tells the shader where
 * the image sits on screen each frame (so a slow push-in just works).
 */
const MAX_PARTS = 10;
const MAX_EYES = 4;

const FRAG = `
#define SHADER_NAME FV_LIVING_ART_FS
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uMainSampler;
uniform vec4 uRect;
uniform float uAspect;
uniform float uFlipY;
uniform float uCount;
uniform vec2 uPivot[${MAX_PARTS}];
uniform vec4 uRegion[${MAX_PARTS}];
uniform vec4 uXform[${MAX_PARTS}];
uniform vec2 uShift[${MAX_PARTS}];
uniform float uEyeCount;
uniform vec4 uEye[${MAX_EYES}];
uniform vec4 uLid[${MAX_EYES}];

varying vec2 outTexCoord;

vec2 toTex(vec2 imgUV) {
  vec2 s = uRect.xy + imgUV * uRect.zw;
  return vec2(s.x, uFlipY > 0.5 ? 1.0 - s.y : s.y);
}

void main() {
  vec2 s = vec2(outTexCoord.x, uFlipY > 0.5 ? 1.0 - outTexCoord.y : outTexCoord.y);
  vec2 uv = (s - uRect.xy) / uRect.zw;
  vec2 q = vec2(uv.x * uAspect, uv.y);

  // inverse-map each region in hierarchy order (outermost first)
  for (int i = 0; i < ${MAX_PARTS}; i++) {
    if (float(i) >= uCount) break;
    vec4 rg = uRegion[i];
    vec4 xf = uXform[i];
    vec2 c = vec2(rg.x * uAspect, rg.y);
    vec2 r = vec2(rg.z * uAspect, rg.w);
    float e = length((q - c) / r);
    float w = 1.0 - smoothstep(xf.w, 1.0, e);
    if (w <= 0.0) continue;
    vec2 pv = vec2(uPivot[i].x * uAspect, uPivot[i].y);
    vec2 sh = vec2(uShift[i].x * uAspect, uShift[i].y);
    vec2 d = q - pv - sh;
    float ca = cos(-xf.x);
    float sa = sin(-xf.x);
    d = vec2(ca * d.x - sa * d.y, sa * d.x + ca * d.y);
    d /= xf.yz;
    q = mix(q, pv + d, w);
  }

  vec2 src = vec2(q.x / uAspect, q.y);
  vec4 col = texture2D(uMainSampler, toTex(src));

  for (int j = 0; j < ${MAX_EYES}; j++) {
    if (float(j) >= uEyeCount) break;
    float b = uLid[j].z;
    if (b <= 0.001) continue;
    vec2 d = (src - uEye[j].xy) / uEye[j].zw;
    float ell = 1.0 - smoothstep(0.82, 1.0, length(d));
    if (ell <= 0.0) continue;
    float edge = -1.0 + 2.05 * b;
    float lid = 1.0 - smoothstep(edge - 0.07, edge + 0.07, d.y);
    vec3 lc = texture2D(uMainSampler, toTex(uLid[j].xy)).rgb;
    vec3 lidCol = lc * (0.93 + 0.07 * clamp(-d.y, 0.0, 1.0));
    float lash = (1.0 - smoothstep(0.0, 0.13, abs(d.y - edge))) * smoothstep(0.1, 0.3, b);
    lidCol = mix(lidCol, lc * 0.42, lash * 0.85);
    col.rgb = mix(col.rgb, lidCol, ell * max(lid, lash * 0.85));
  }

  gl_FragColor = col;
}
`;

export class LivingArtPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  static readonly KEY = "FvLivingArt";

  /** Image rect as screen fractions (x, y, w, h), top-left origin. */
  rect: [number, number, number, number] = [0, 0, 1, 1];
  aspect = 1;
  /** Render targets are stored bottom-up; flip our top-left maths to match. */
  flipY = 1;

  private rig: LivingRig | null = null;
  private pivots = new Float32Array(MAX_PARTS * 2);
  private regions = new Float32Array(MAX_PARTS * 4);
  private xforms = new Float32Array(MAX_PARTS * 4);
  private shifts = new Float32Array(MAX_PARTS * 2);
  private eyes = new Float32Array(MAX_EYES * 4);
  private lids = new Float32Array(MAX_EYES * 4);
  private count = 0;
  private eyeCount = 0;

  constructor(game: Phaser.Game) {
    super({ game, name: LivingArtPipeline.KEY, fragShader: FRAG });
  }

  /** Register once per game; returns false on the Canvas renderer (no post-FX there). */
  static register(game: Phaser.Game): boolean {
    const r = game.renderer;
    if (!(r instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return false;
    const mgr = r.pipelines;
    if (!mgr.postPipelineClasses.has(LivingArtPipeline.KEY)) {
      mgr.addPostPipeline(LivingArtPipeline.KEY, LivingArtPipeline);
    }
    return true;
  }

  setRig(rig: LivingRig, aspect: number): void {
    this.rig = rig;
    this.aspect = aspect;
    this.count = Math.min(MAX_PARTS, rig.parts.length);
    rig.parts.slice(0, MAX_PARTS).forEach((p, i) => {
      this.pivots.set(p.pivot, i * 2);
      this.regions.set(p.region, i * 4);
      this.xforms.set([0, 1, 1, p.core], i * 4);
    });
    this.eyeCount = Math.min(MAX_EYES, rig.eyes.length);
    rig.eyes.slice(0, MAX_EYES).forEach((e, i) => {
      this.eyes.set([e.x, e.y, e.rx, e.ry], i * 4);
      this.lids.set([e.lid[0], e.lid[1], 0, 0], i * 4);
    });
  }

  setImageRect(x: number, y: number, w: number, h: number, screenW: number, screenH: number): void {
    this.rect = [x / screenW, y / screenH, w / screenW, h / screenH];
  }

  applyFrame(frame: LivingFrame): void {
    if (!this.rig) return;
    this.rig.parts.slice(0, MAX_PARTS).forEach((p, i) => {
      const pose = frame.poses[p.id];
      if (!pose) return;
      this.xforms[i * 4] = pose.angle;
      this.xforms[i * 4 + 1] = pose.sx;
      this.xforms[i * 4 + 2] = pose.sy;
      this.shifts[i * 2] = pose.tx;
      this.shifts[i * 2 + 1] = pose.ty;
    });
    for (let i = 0; i < this.eyeCount; i++) this.lids[i * 4 + 2] = frame.blink[i] ?? 0;
  }

  onPreRender(): void {
    this.set4f("uRect", this.rect[0], this.rect[1], this.rect[2], this.rect[3]);
    this.set1f("uAspect", this.aspect);
    this.set1f("uFlipY", this.flipY);
    this.set1f("uCount", this.count);
    this.set2fv("uPivot", this.pivots);
    this.set4fv("uRegion", this.regions);
    this.set4fv("uXform", this.xforms);
    this.set2fv("uShift", this.shifts);
    this.set1f("uEyeCount", this.eyeCount);
    this.set4fv("uEye", this.eyes);
    this.set4fv("uLid", this.lids);
  }
}
