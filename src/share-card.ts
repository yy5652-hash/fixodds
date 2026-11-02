import { type Input, type Model } from './core';
import { shareCardLines } from './share-lines';
export async function shareCard(input: Input, model: Model): Promise<string> {
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('Image creation is unavailable in this browser.');
  ctx.fillStyle = '#f6f5f1'; ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(36, 36, 1128, 558, 24); ctx.fill();
  ctx.fillStyle = '#b8400c'; ctx.font = '700 30px "Inter Variable", sans-serif'; ctx.fillText('FixOdds.', 76, 98);
  const lines = shareCardLines(input, model);
  let y = 160;
  for (const [index, line] of lines.entries()) {
    ctx.fillStyle = index === 1 ? '#1f7a4d' : '#25231e';
    ctx.font = `${index === 1 ? '750 54' : index < 4 ? '550 30' : '400 21'}px "Inter Variable", sans-serif`;
    const words = line.split(' '); let row = '';
    for (const word of words) {
      const next = row ? `${row} ${word}` : word;
      if (ctx.measureText(next).width > 1048 && row) { ctx.fillText(row, 76, y); y += index === 1 ? 60 : 30; row = word; }
      else row = next;
    }
    ctx.fillText(row, 76, y); y += index === 1 ? 80 : index < 4 ? 64 : 38;
  }
  ctx.fillStyle = '#b8400c'; ctx.font = '600 21px "Inter Variable", sans-serif'; ctx.fillText(location.host + location.pathname, 76, 562);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('PNG creation failed.')), 'image/png'));
  const file = new File([blob], 'fixodds-repair.png', { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'FixOdds repair outlook' }); }
    catch { return 'PNG downloaded. Sharing was closed or unavailable.'; }
  }
  return 'PNG downloaded.';
}
