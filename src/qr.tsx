import qrcode from 'qrcode-generator';
export default function TicketQR({ url }: { url: string }) {
  let src = '';
  try {
    // Keep the printed modules legible; longer links can still be copied.
    if (url.length > 2200) throw Error('long');
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    src = qr.createDataURL(3, 12);
  } catch { return <p className="small">This link is too long for a clear QR code. Copy the share link instead.</p>; }
  return <figure className="ticket-qr"><img src={src} alt="QR code to open this repair ticket"/><figcaption>Scan to open this ticket. The link leaves out your description unless you opt in.</figcaption></figure>;
}
