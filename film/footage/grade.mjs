// FFmpeg 7.1; filter syntax: https://ffmpeg.org/ffmpeg-filters.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const dir = path.dirname(fileURLToPath(import.meta.url));
const ff = path.resolve(dir, '../../../revoice-2026-10-24/bin/ffmpeg');
const { clips } = JSON.parse(fs.readFileSync(path.join(dir, 'clips.json')));
const force = process.argv.includes('--force');
for (const clip of clips) {
  for (const [folder, w, h] of [['graded', 1920, 1080], ['graded_v', 1080, 1920]]) {
    const dest = path.join(dir, folder, clip.id);
    if (force || !fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
      fs.mkdirSync(dest, { recursive: true });
      const [x, y, cw, ch] = clip.crop;
      const filters = [
        `crop=iw*${cw}:ih*${ch}:iw*${x}:ih*${y}`,
        `scale=${w}:${h}:force_original_aspect_ratio=increase`,
        `crop=${w}:${h},setsar=1,fps=30`,
        'eq=saturation=0.85:contrast=1.06:brightness=-0.01',
        'colorbalance=rs=-0.025:gs=0.012:bs=0.025:rh=0.025:gh=0.01:bh=-0.02:pl=1',
        'vignette=PI/8,noise=alls=5:allf=t+u',
      ].join(',');
      const result = spawnSync(ff, ['-hide_banner', '-loglevel', 'error', '-y',
        '-ss', String(clip.in), '-i', path.join(dir, clip.src), '-t', String(clip.out - clip.in),
        '-an', '-vf', filters, '-threads', '2', '-q:v', '3', '-start_number', '1', path.join(dest, '%04d.jpg')], { stdio: 'inherit' });
      if (result.error || result.status !== 0) {
        fs.rmSync(dest, { recursive: true, force: true });
        throw result.error || Error(`ffmpeg failed for ${folder}/${clip.id}: ${result.status}`);
      }
    }
    const count = fs.readdirSync(dest).filter(f => /^\d{4,}\.jpg$/.test(f)).length;
    if (!count) throw Error(`No frames: ${dest}; rerun with --force`);
    console.log(`${folder}/${clip.id}: ${count} frames`);
  }
}
