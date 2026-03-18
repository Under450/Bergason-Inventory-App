import jsPDF from 'jspdf';
import { Inventory } from '../types';

/**
 * Generates a professional A4 PDF using jsPDF's native drawing API.
 * No html2canvas, no CSS, no oklch — pure vector rendering.
 */

// ── Colours ──────────────────────────────────────────────────────────────────
const C = {
  navy:    [15,  23,  42]  as [number,number,number],
  gold:    [212, 175, 55]  as [number,number,number],
  white:   [255, 255, 255] as [number,number,number],
  black:   [30,  41,  59]  as [number,number,number],
  gray:    [100, 116, 139] as [number,number,number],
  lgray:   [226, 232, 240] as [number,number,number],
  xlgray:  [248, 250, 252] as [number,number,number],
  green:   [22,  163, 74]  as [number,number,number],
  lgreen:  [220, 252, 231] as [number,number,number],
  dgreen:  [22,  101, 52]  as [number,number,number],
  yellow:  [254, 249, 195] as [number,number,number],
  dyellow: [133, 77,  14]  as [number,number,number],
  blue:    [219, 234, 254] as [number,number,number],
  dblue:   [30,  64,  175] as [number,number,number],
  orange:  [255, 237, 213] as [number,number,number],
  dorange: [154, 52,  18]  as [number,number,number],
  red:     [220, 38,  38]  as [number,number,number],
  lred:    [254, 226, 226] as [number,number,number],
};

const COND_COLOR: Record<string, { bg: [number,number,number]; fg: [number,number,number] }> = {
  'Excellent':           { bg: C.green,  fg: C.white   },
  'Good':                { bg: C.lgreen, fg: C.dgreen  },
  'Fair':                { bg: C.yellow, fg: C.dyellow },
  'Consistent With Age': { bg: C.blue,   fg: C.dblue   },
  'Poor':                { bg: C.orange, fg: C.dorange },
  'Needs Attention':     { bg: C.red,    fg: C.white   },
};
const CLEAN_COLOR: Record<string, { bg: [number,number,number]; fg: [number,number,number] }> = {
  'Professional Clean':  { bg: C.green,  fg: C.white   },
  'Domestic Clean':      { bg: C.blue,   fg: C.dblue   },
  'Good':                { bg: C.lgreen, fg: C.dgreen  },
  'Fair':                { bg: C.yellow, fg: C.dyellow },
  'Poor':                { bg: C.orange, fg: C.dorange },
  'Dirty':               { bg: C.red,    fg: C.white   },
};

// ── PDF helpers ───────────────────────────────────────────────────────────────
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;

class PDFBuilder {
  pdf: jsPDF;
  y: number;
  page: number;

  constructor() {
    this.pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    this.y = MARGIN;
    this.page = 1;
  }

  checkPage(needed = 10) {
    if (this.y + needed > PAGE_H - MARGIN) {
      this.pdf.addPage();
      this.page++;
      this.y = MARGIN;
      return true;
    }
    return false;
  }

  setFont(style: 'normal'|'bold'|'italic' = 'normal', size = 10) {
    this.pdf.setFont('helvetica', style);
    this.pdf.setFontSize(size);
  }

  setColor(rgb: [number,number,number]) {
    this.pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
  }

  setFill(rgb: [number,number,number]) {
    this.pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
  }

  setDraw(rgb: [number,number,number]) {
    this.pdf.setDrawColor(rgb[0], rgb[1], rgb[2]);
  }

  rect(x: number, y: number, w: number, h: number, fill?: [number,number,number], stroke?: [number,number,number]) {
    if (fill) this.setFill(fill);
    if (stroke) this.setDraw(stroke); else this.pdf.setDrawColor(255,255,255);
    const style = fill && stroke ? 'FD' : fill ? 'F' : 'D';
    this.pdf.rect(x, y, w, h, style);
  }

  text(txt: string, x: number, y: number, opts?: { align?: 'left'|'center'|'right'; maxWidth?: number }) {
    if (!txt) return;
    this.pdf.text(txt, x, y, opts as any);
  }

  wrap(txt: string, x: number, maxW: number, lineH: number): number {
    const lines = this.pdf.splitTextToSize(txt || '', maxW);
    lines.forEach((line: string, i: number) => {
      this.checkPage();
      this.text(line, x, this.y + i * lineH);
    });
    return lines.length * lineH;
  }

  sectionTitle(title: string) {
    this.checkPage(12);
    this.y += 6;
    this.rect(MARGIN, this.y, CONTENT_W, 7, C.navy);
    this.setFont('bold', 9);
    this.setColor(C.gold);
    this.text(title.toUpperCase(), MARGIN + 3, this.y + 4.8);
    this.y += 9;
  }

  badge(txt: string, x: number, y: number, w: number, colors: { bg: [number,number,number]; fg: [number,number,number] }) {
    this.rect(x, y - 3.5, w, 5, colors.bg);
    this.setFont('bold', 7);
    this.setColor(colors.fg);
    this.text(txt || '—', x + w/2, y, { align: 'center' });
  }

  hLine(col?: [number,number,number]) {
    this.setDraw(col || C.lgray);
    this.pdf.setLineWidth(0.2);
    this.pdf.line(MARGIN, this.y, PAGE_W - MARGIN, this.y);
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
export const generateInventoryPDF = async (inventory: Inventory, logoUrl: string): Promise<Blob> => {
  const b = new PDFBuilder();
  const pdf = b.pdf;

  // Active rooms
  const activeRoomIds = inventory.activeRoomIds || inventory.rooms.map(r => r.id);
  const activeRooms = inventory.rooms.filter(r => activeRoomIds.includes(r.id) && !r.pdfExcluded);

  // ── HEADER ─────────────────────────────────────────────────────────────────
  // Logo — fully wrapped so any failure is silent
  try {
    const logoB64 = await loadImageAsBase64(logoUrl);
    if (logoB64 && logoB64.length > 100) {
      // jsPDF addImage needs format hint — detect from data URL prefix
      const fmt = logoB64.startsWith('/9j/') ? 'JPEG' : 'PNG';
      pdf.addImage(logoB64, fmt, PAGE_W/2 - 15, b.y, 30, 12, undefined, 'FAST');
    }
  } catch (logoErr) {
    console.warn('Logo load failed (non-fatal):', logoErr);
  }
  b.y += 15;

  b.setFont('bold', 18);
  b.setColor(C.navy);
  b.text('INVENTORY & SCHEDULE OF CONDITION', PAGE_W/2, b.y, { align: 'center' });
  b.y += 6;

  b.setFont('normal', 11);
  b.setColor(C.gray);
  b.text(inventory.address, PAGE_W/2, b.y, { align: 'center' });
  b.y += 5;

  b.setFont('normal', 9);
  const dateStr = new Date(inventory.dateCreated).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  b.text(`Date: ${dateStr}   ·   Ref: ${inventory.propertyId || '—'}`, PAGE_W/2, b.y, { align: 'center' });
  b.y += 4;

  // Gold divider
  b.setDraw(C.gold);
  b.pdf.setLineWidth(0.8);
  b.pdf.line(MARGIN, b.y, PAGE_W - MARGIN, b.y);
  b.y += 8;

  // ── 1. PROPERTY DETAILS ────────────────────────────────────────────────────
  b.sectionTitle('1. Property Details');

  const propRows: [string, string][] = [
    ['Property Address',   inventory.address],
    ['Property ID',        inventory.propertyId || '—'],
    ['Property Type',      inventory.propertyType || '—'],
    ['Description',        inventory.propertyDescription || '—'],
    ['Pre-Tenancy Clean',  inventory.preTenancyClean
      ? `Yes${inventory.preTenancyCleanDate ? ' — ' + inventory.preTenancyCleanDate : ''}${inventory.preTenancyCleanInvoiceRef ? ' (Inv: ' + inventory.preTenancyCleanInvoiceRef + ')' : ''}`
      : 'Not recorded'],
  ];

  propRows.forEach(([label, value]) => {
    b.checkPage(8);
    const rowH = 6;
    b.rect(MARGIN, b.y, 50, rowH, C.xlgray);
    b.setFont('bold', 8);
    b.setColor(C.gray);
    b.text(label, MARGIN + 2, b.y + 4);
    b.setFont('normal', 8);
    b.setColor(C.black);
    const lines = pdf.splitTextToSize(value, CONTENT_W - 54);
    lines.forEach((line: string, i: number) => b.text(line, MARGIN + 53, b.y + 4 + i * 4.5));
    b.y += Math.max(rowH, lines.length * 4.5) + 1;
  });

  // ── 2. HEALTH & SAFETY ─────────────────────────────────────────────────────
  b.sectionTitle('2. Health & Safety Alarm Compliance Checks');

  // Column headers
  b.rect(MARGIN, b.y, CONTENT_W - 25, 6, C.xlgray);
  b.rect(PAGE_W - MARGIN - 25, b.y, 25, 6, C.xlgray);
  b.setFont('bold', 8);
  b.setColor(C.gray);
  b.text('CHECK', MARGIN + 2, b.y + 4);
  b.text('RESULT', PAGE_W - MARGIN - 12.5, b.y + 4, { align: 'center' });
  b.y += 7;

  inventory.healthSafetyChecks.forEach((check, i) => {
    b.checkPage(7);
    const bg = i % 2 === 0 ? C.white : C.xlgray;
    b.rect(MARGIN, b.y, CONTENT_W, 6.5, bg);

    b.setFont('normal', 8);
    b.setColor(C.black);
    b.text(check.question, MARGIN + 2, b.y + 4.2);

    const ans = check.answer || '—';
    const ansColor = ans === 'YES' ? C.green : ans === 'NO' ? C.red : C.gray;
    b.setFont('bold', 8);
    b.setColor(ansColor);
    b.text(ans, PAGE_W - MARGIN - 12.5, b.y + 4.2, { align: 'center' });
    b.y += 6.5;
  });

  b.y += 3;

  // ── 3. CONDITION / CLEANLINESS KEY ─────────────────────────────────────────
  b.sectionTitle('3. Condition & Cleanliness Key');

  const condEntries = Object.entries(COND_COLOR);
  const cleanEntries = Object.entries(CLEAN_COLOR);
  const keyColW = CONTENT_W / 2 - 3;

  b.setFont('bold', 8);
  b.setColor(C.gray);
  b.text('CONDITION', MARGIN, b.y + 3);
  b.text('CLEANLINESS', MARGIN + keyColW + 6, b.y + 3);
  b.y += 5;

  const maxKeys = Math.max(condEntries.length, cleanEntries.length);
  for (let i = 0; i < maxKeys; i++) {
    b.checkPage(6);
    if (condEntries[i]) {
      const [label, colors] = condEntries[i];
      b.rect(MARGIN, b.y, 8, 4.5, colors.bg);
      b.setFont('normal', 8);
      b.setColor(C.black);
      b.text(label, MARGIN + 10, b.y + 3.5);
    }
    if (cleanEntries[i]) {
      const [label, colors] = cleanEntries[i];
      b.rect(MARGIN + keyColW + 6, b.y, 8, 4.5, colors.bg);
      b.setFont('normal', 8);
      b.setColor(C.black);
      b.text(label, MARGIN + keyColW + 16, b.y + 3.5);
    }
    b.y += 5.5;
  }

  b.y += 3;

  // ── 4. ROOMS ───────────────────────────────────────────────────────────────
  b.sectionTitle('4. Room-by-Room Schedule');

  const COL = {
    item:   { x: MARGIN,      w: 42 },
    desc:   { x: MARGIN + 43, w: 78 },
    cond:   { x: MARGIN + 122, w: 24 },
    clean:  { x: MARGIN + 147, w: 24 },
  };

  let prevFloor = '';

  for (const room of activeRooms) {
    const visibleItems = room.items.filter(i => !i.excluded);
    if (visibleItems.length === 0) continue;

    const isMeter = room.name === 'Meter Cupboard';

    // Floor group header
    if (room.floorGroup && room.floorGroup !== prevFloor) {
      b.checkPage(10);
      b.y += 3;
      b.rect(MARGIN, b.y, CONTENT_W, 6, [51, 65, 85]);
      b.setFont('bold', 8);
      b.setColor(C.white);
      b.text(room.floorGroup.toUpperCase(), PAGE_W/2, b.y + 4.2, { align: 'center' });
      b.y += 7;
      prevFloor = room.floorGroup;
    }

    // Room header bar
    b.checkPage(12);
    b.rect(MARGIN, b.y, CONTENT_W, 7, C.navy);
    b.setFont('bold', 10);
    b.setColor(C.white);
    b.text(room.name, MARGIN + 3, b.y + 4.8);
    b.setFont('normal', 8);
    b.setColor(C.gold);
    b.text(`${visibleItems.length} items`, PAGE_W - MARGIN - 2, b.y + 4.8, { align: 'right' });
    b.y += 8;

    // Room meta (odour, decoration)
    const meta = [
      room.odourNotes    ? `Odour: ${room.odourNotes}` : '',
      room.decorationColour ? `Decoration: ${room.decorationColour}` : '',
      room.lastDecorated ? `Last decorated: ${room.lastDecorated}` : '',
    ].filter(Boolean).join('   ·   ');
    if (meta) {
      b.checkPage(6);
      b.rect(MARGIN, b.y, CONTENT_W, 5.5, [255, 251, 235]);
      b.setFont('italic', 7.5);
      b.setColor(C.dyellow);
      b.text(meta, MARGIN + 2, b.y + 3.8);
      b.y += 6;
    }

    // Column headers
    b.checkPage(6);
    b.rect(MARGIN, b.y, CONTENT_W, 5.5, C.xlgray);
    b.setFont('bold', 7);
    b.setColor(C.gray);
    b.text('ITEM',                   COL.item.x + 1,  b.y + 3.8);
    b.text('DESCRIPTION / DETAILS',  COL.desc.x + 1,  b.y + 3.8);
    b.text(isMeter ? 'SUPPLIER' : 'CONDITION',  COL.cond.x + COL.cond.w/2, b.y + 3.8, { align: 'center' });
    b.text(isMeter ? 'TYPE' : 'CLEANLINESS', COL.clean.x + COL.clean.w/2, b.y + 3.8, { align: 'center' });
    b.y += 6;

    // Items
    visibleItems.forEach((item, idx) => {
      // Estimate row height
      const descLines = pdf.splitTextToSize(
        [item.description, item.make ? `Make: ${item.make}${item.model ? '/' + item.model : ''}` : '', item.serialNumber ? `Serial: ${item.serialNumber}` : ''].filter(Boolean).join('\n'),
        COL.desc.w - 2
      );
      const rowH = Math.max(7, descLines.length * 4 + 3);
      b.checkPage(rowH + 2);

      const bg = idx % 2 === 0 ? C.white : C.xlgray;
      b.rect(MARGIN, b.y, CONTENT_W, rowH, bg);

      // Item name
      b.setFont('bold', 8);
      b.setColor(C.black);
      const nameLines = pdf.splitTextToSize(item.name, COL.item.w - 2);
      nameLines.forEach((l: string, li: number) => b.text(l, COL.item.x + 1, b.y + 4 + li * 4));

      // Description
      b.setFont('normal', 7.5);
      b.setColor(C.black);
      if (item.description) {
        const dLines = pdf.splitTextToSize(item.description, COL.desc.w - 2);
        dLines.forEach((l: string, li: number) => b.text(l, COL.desc.x + 1, b.y + 4 + li * 4));
      }
      // Sub-details
      let subY = b.y + 4 + (item.description ? pdf.splitTextToSize(item.description, COL.desc.w - 2).length * 4 : 0);
      b.setFont('normal', 6.5);
      b.setColor(C.gray);
      if (item.make)         { b.text(`Make: ${item.make}${item.model ? ' / ' + item.model : ''}`, COL.desc.x + 1, subY); subY += 3.5; }
      if (item.serialNumber) { b.text(`Serial: ${item.serialNumber}`, COL.desc.x + 1, subY); subY += 3.5; }
      if (item.accountNumber){ b.text(`Account: ${item.accountNumber}`, COL.desc.x + 1, subY); subY += 3.5; }
      if (item.qualityTier)  { b.text(`Quality: ${item.qualityTier}`, COL.desc.x + 1, subY); subY += 3.5; }
      if (item.installedDate){ b.text(`Installed: ${item.installedDate}`, COL.desc.x + 1, subY); subY += 3.5; }

      // Condition badge
      if (!isMeter && item.condition) {
        const cc = COND_COLOR[item.condition] || { bg: C.lgray, fg: C.black };
        b.badge(item.condition, COL.cond.x + 1, b.y + rowH/2 + 1, COL.cond.w - 2, cc);
      } else if (isMeter && item.supplier) {
        b.setFont('normal', 7.5);
        b.setColor(C.black);
        b.text(item.supplier, COL.cond.x + COL.cond.w/2, b.y + rowH/2 + 1, { align: 'center' });
      }

      // Cleanliness badge
      if (!isMeter && item.cleanliness) {
        const cc = CLEAN_COLOR[item.cleanliness] || { bg: C.lgray, fg: C.black };
        b.badge(item.cleanliness, COL.clean.x + 1, b.y + rowH/2 + 1, COL.clean.w - 2, cc);
      } else if (isMeter && item.meterType) {
        b.setFont('normal', 7.5);
        b.setColor(C.black);
        b.text(item.meterType, COL.clean.x + COL.clean.w/2, b.y + rowH/2 + 1, { align: 'center' });
      }

      // Row border
      b.hLine(C.lgray);
      b.y += rowH;
    });

    b.y += 4;
  }

  // ── 5. DOCUMENTS ───────────────────────────────────────────────────────────
  const uploadedDocs = inventory.documents.filter(d => d.fileData || d.uploadDate);
  if (uploadedDocs.length > 0) {
    b.sectionTitle('5. Documents');
    uploadedDocs.forEach((doc, i) => {
      b.checkPage(8);
      const bg = i % 2 === 0 ? C.white : C.xlgray;
      b.rect(MARGIN, b.y, CONTENT_W, 7, bg);
      b.setFont('bold', 8.5);
      b.setColor(C.navy);
      b.text(doc.name, MARGIN + 3, b.y + 4.5);
      if (doc.uploadDate) {
        b.setFont('normal', 7.5);
        b.setColor(C.gray);
        const uploaded = new Date(doc.uploadDate).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
        b.text(`Uploaded: ${uploaded}`, PAGE_W - MARGIN - 2, b.y + 4.5, { align: 'right' });
      }
      b.setFont('bold', 7);
      b.setColor(doc.fileData ? C.green : C.gray);
      b.text(doc.fileData ? '✓ Attached' : '— Not uploaded', MARGIN + CONTENT_W - 40, b.y + 4.5, { align: 'right' });
      b.y += 8;
    });
    b.y += 3;
  }

  // ── 6. SIGNATURES ──────────────────────────────────────────────────────────
  if (inventory.signatures.length > 0) {
    b.sectionTitle(`${uploadedDocs.length > 0 ? '6' : '5'}. Signatures`);
    for (const sig of inventory.signatures) {
      b.checkPage(22);
      b.setFont('bold', 9);
      b.setColor(C.navy);
      b.text(`${sig.type}${sig.name ? ' — ' + sig.name : ''}`, MARGIN, b.y + 4);
      if (sig.date) {
        b.setFont('normal', 7.5);
        b.setColor(C.gray);
        b.text(new Date(sig.date).toLocaleString('en-GB'), MARGIN, b.y + 8.5);
      }
      if (sig.data) {
        try {
          // sig.data is a full data URL — strip prefix for jsPDF
          const sigB64 = sig.data.includes(',') ? sig.data.split(',')[1] : sig.data;
          const sigFmt = sig.data.includes('jpeg') ? 'JPEG' : 'PNG';
          if (sigB64 && sigB64.length > 10) {
            pdf.addImage(sigB64, sigFmt, MARGIN, b.y + 10, 60, 15, undefined, 'FAST');
          }
        } catch (sigErr) {
          console.warn('Signature embed failed (non-fatal):', sigErr);
        }
      }
      b.y += 28;
    }
  }

  // ── PHOTO APPENDIX ─────────────────────────────────────────────────────────
  const photoItems: { roomName: string; itemName: string; url: string; idx: number }[] = [];
  let photoIdx = 1;
  for (const room of activeRooms) {
    for (const item of room.items) {
      if (item.excluded) continue;
      for (const p of item.photos) {
        try {
          const parsed = JSON.parse(p);
          if (parsed?.url) photoItems.push({ roomName: room.name, itemName: item.name, url: parsed.url, idx: photoIdx++ });
        } catch { /* skip */ }
      }
    }
  }

  if (photoItems.length > 0) {
    b.sectionTitle('Appendix: Photo Schedule');

    const PHOTO_W = 58;
    const PHOTO_H = 42;
    const COLS = 3;
    const GAP = 3;

    let col = 0;
    let rowStartY = b.y;

    for (const p of photoItems) {
      if (col === 0) {
        b.checkPage(PHOTO_H + 14);
        rowStartY = b.y;
      }
      const px = MARGIN + col * (PHOTO_W + GAP);

      try {
        const imgB64 = await loadImageAsBase64(p.url);
        if (imgB64 && imgB64.length > 100) {
          pdf.addImage(imgB64, 'JPEG', px, rowStartY, PHOTO_W, PHOTO_H, undefined, 'FAST');
        }
      } catch (photoErr) {
        console.warn('Photo embed failed (non-fatal):', photoErr);
      }

      b.rect(px, rowStartY + PHOTO_H, PHOTO_W, 5, C.navy);
      b.setFont('bold', 6.5);
      b.setColor(C.white);
      b.text(`#${p.idx} · ${p.roomName}`, px + PHOTO_W/2, rowStartY + PHOTO_H + 3.5, { align: 'center' });

      b.setFont('normal', 6.5);
      b.setColor(C.gray);
      b.text(p.itemName, px + PHOTO_W/2, rowStartY + PHOTO_H + 8, { align: 'center' });

      col++;
      if (col >= COLS) {
        col = 0;
        b.y = rowStartY + PHOTO_H + 12;
      }
    }
    if (col > 0) b.y = rowStartY + PHOTO_H + 12;
  }

  // ── FOOTER on every page ───────────────────────────────────────────────────
  const totalPages = pdf.getNumberOfPages();
  for (let pg = 1; pg <= totalPages; pg++) {
    pdf.setPage(pg);
    pdf.setDrawColor(C.lgray[0], C.lgray[1], C.lgray[2]);
    pdf.setLineWidth(0.2);
    pdf.line(MARGIN, PAGE_H - 10, PAGE_W - MARGIN, PAGE_H - 10);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(C.gray[0], C.gray[1], C.gray[2]);
    pdf.text('Bergason Property Services  ·  inventory@bergason.co.uk', MARGIN, PAGE_H - 6);
    pdf.text(`Page ${pg} of ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 6, { align: 'right' });
  }

  return pdf.output('blob');
};

// ── Image loader ───────────────────────────────────────────────────────────────
const loadImageAsBase64 = (url: string): Promise<string> =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || 1;
        c.height = img.naturalHeight || 1;
        c.getContext('2d')!.drawImage(img, 0, 0);
        const data = c.toDataURL('image/jpeg', 0.85);
        // Strip the data:image/jpeg;base64, prefix — jsPDF wants raw base64
        resolve(data.split(',')[1] || '');
      } catch {
        resolve(''); // canvas tainted — skip image
      }
    };
    img.onerror = () => resolve(''); // always resolve so PDF continues
    // Try with cache bust
    img.src = url.includes('?') ? url + '&_pdf=1' : url + '?_pdf=1';
  });
