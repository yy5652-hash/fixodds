# Lays narration over the Dvořák cuts: the music lands on the verdict, the dataset figure and the end card, and ducks under speech.
# .venv-mlx/bin/python film/mix.py <landscape|portrait>
import json, re, subprocess, sys
from pathlib import Path
import numpy as np, soundfile as sf
HERE = Path(__file__).parent; mode = sys.argv[1]; SR = 48000
FF = str(HERE.parent.parent / 'revoice-2026-10-24/bin/ffmpeg')
tl = json.load(open(HERE / f'work/timeline_{mode}.json')); T = tl['scenes']; L = tl['lines']; END = tl['end']; N = int(END * SR) + SR // 2
def load(path, ch):
    raw = subprocess.run([FF, '-v', 'error', '-i', str(path), '-ac', str(ch), '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, ch).astype(np.float64)
largo = load(HERE / 'music/ii._largo.ogg', 2); allegro = load(HERE / 'music/iv._allegro_con_fuoco.ogg', 2)
def onset(x, a, b, win=.05):
    n = int(win * SR); s = x[int(a * SR):int(b * SR)].mean(1); k = len(s) // n
    e = 20 * np.log10(np.sqrt((s[:k * n].reshape(k, n) ** 2).mean(1)) + 1e-5)
    return a + (np.argmax(np.diff(e)) + 1) * win
L0, A1, A2 = onset(largo, 11.5, 14), onset(allegro, 11.2, 12.6), onset(allegro, 54, 55.2)
tail = allegro[-12 * SR:].mean(1); w = int(.05 * SR); e = np.sqrt(np.array([(tail[i:i + w] ** 2).mean() for i in range(0, len(tail) - w, w)]))
gap = np.argmin(e[:int(7 / .05)]); Af = len(allegro) / SR - 12 + (gap + np.argmax(e[gap:] > e.max() * .25)) * .05  # silence before the last chord
print(f'largo chord {L0:.2f}, allegro theme {A1:.2f}, second entry {A2:.2f}, final chord {Af:.2f}')
music = np.zeros((N, 2))
def place(src, src_t, t0, t1, fin=.05, fout=.05, gain=1.0):
    a, b = int(t0 * SR), min(int(t1 * SR), N); c = int(src_t * SR); seg = src[c:c + b - a].copy() * gain
    env = np.ones(len(seg)); i = int(fin * SR); o = int(fout * SR)
    env[:i] = np.sin(np.linspace(0, np.pi / 2, i)) ** 2; env[-o:] = np.minimum(env[-o:], np.cos(np.linspace(0, np.pi / 2, o)) ** 2)
    music[a:a + len(seg)] += seg * env[:, None]
GL, GA = 10 ** (7 / 20), 10 ** (-3 / 20)
t5, t8, t12 = T['s05'], T['s08'], T['s12']; lead = A1 - 8.0
place(largo, L0, .22, t5 - lead + .9, fin=.03, fout=1.4, gain=GL)
pos = lambda t: A1 + (t - t5)
if 2 <= A2 - pos(t8) <= 12:    # both sides of the join are in the quiet strings, so a soft crossfade hides it
    tx = t5 + (44 - A1)
    place(allegro, pos(t5 - lead), t5 - lead, tx + .5, fin=1.2, fout=1.0, gain=GA)
    place(allegro, A2 - (t8 - (tx - .5)), tx - .5, t12 - .1, fin=1.0, fout=2.2, gain=GA)
else:                          # short version: cut on the entry itself
    place(allegro, pos(t5 - lead), t5 - lead, t8 + .2, fin=1.2, fout=.35, gain=GA)
    place(allegro, A2 - .15, t8 - .15, t12 - .1, fin=.25, fout=1.6, gain=GA)
chord = t12 + .2
place(allegro, Af, chord, END + .05, fin=.02, fout=1.3, gain=GA * 1.1)
voice = np.zeros(N)
for k, v in L.items():
    x = load(HERE / f'audio_v2/{k}.wav', 1)[:, 0] * 1.25; a = int(v['t'] * SR); voice[a:a + len(x)] += x
# Duck: fast down just before a line, slower back up after it.
act = (np.abs(voice) > 1e-3).astype(np.float64); hop = int(.02 * SR); blocks = act[:len(act) // hop * hop].reshape(-1, hop).max(1)
hold = int(.6 / .02)  # short pauses between lines stay ducked
held = np.array([blocks[max(0, i - hold):i + 8].max() for i in range(len(blocks))])
depth = np.where(np.arange(len(held)) * .02 < t5, .2, .09); depth = np.where((np.arange(len(held)) * .02 >= t8) & (np.arange(len(held)) * .02 < T.get('s08_end', t8)), .11, depth)
g = np.ones(len(held)); cur = 1.0
for i, (h, d) in enumerate(zip(held, depth)):
    target = d if h else 1.0; cur += (target - cur) * (.35 if target < cur else .04); g[i] = cur
gain = np.interp(np.arange(N), np.arange(len(g)) * hop + hop / 2, g)
duck = music * gain[:, None] * .8
mix = duck + voice[:, None]
speech = np.abs(voice) > .02
print(f'speech rms {20*np.log10(np.sqrt((voice[speech]**2).mean())):.1f} dB, music under speech {20*np.log10(np.sqrt((duck[speech]**2).mean())+1e-9):.1f} dB')
mix = mix[:int(END * SR)]
sf.write(HERE / f'work/mix_{mode}_raw.wav', mix, SR, subtype='FLOAT')
out = HERE / f'work/mix_{mode}.wav'
def measure(path):
    m = subprocess.run([FF, '-hide_banner', '-nostats', '-i', str(path), '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', m)[-1]), float(re.findall(r'Peak:\s+(-?[\d.]+) dBFS', m)[-1])
i0, _ = measure(HERE / f'work/mix_{mode}_raw.wav')
# Plain gain to -16 LUFS, then a limiter only for the few music peaks: speech level stays untouched.
subprocess.run([FF, '-y', '-v', 'error', '-i', str(HERE / f'work/mix_{mode}_raw.wav'), '-af', f'volume={-16 - i0:.2f}dB,alimiter=limit=0.82:attack=5:release=80:level=false', '-ar', '48000', '-c:a', 'pcm_s16le', str(out)], check=True)
print('loudness', measure(out))
print(json.dumps({'largo_from': round(L0, 2), 'allegro_from': round(pos(t5 - lead), 2), 'allegro_second_entry': round(A2, 2), 'final_chord': round(Af, 2), 't5': round(t5, 2), 't8': round(t8, 2), 't12': round(t12, 2)}))
