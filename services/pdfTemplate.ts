import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Inventory } from '../types';

/**
 * Generates a clean, properly formatted A4 PDF from inventory data.
 * Uses a self-contained HTML template with inline styles only — no Tailwind,
 * no oklch, no external CSS — so html2canvas renders it correctly every time.
 */

const COND_STYLE: Record<string, { bg: string; color: string }> = {
  'Excellent':            { bg: '#16a34a', color: '#fff' },
  'Good':                 { bg: '#dcfce7', color: '#166534' },
  'Fair':                 { bg: '#fef9c3', color: '#854d0e' },
  'Consistent With Age':  { bg: '#dbeafe', color: '#1e40af' },
  'Poor':                 { bg: '#ffedd5', color: '#9a3412' },
  'Needs Attention':      { bg: '#dc2626', color: '#fff' },
};

const CLEAN_STYLE: Record<string, { bg: string; color: string }> = {
  'Professional Clean':   { bg: '#16a34a', color: '#fff' },
  'Domestic Clean':       { bg: '#dbeafe', color: '#1e40af' },
  'Good':                 { bg: '#dcfce7', color: '#166534' },
  'Fair':                 { bg: '#fef9c3', color: '#854d0e' },
  'Poor':                 { bg: '#ffedd5', color: '#9a3412' },
  'Dirty':                { bg: '#dc2626', color: '#fff' },
};

const badge = (label: string, map: Record<string, { bg: string; color: string }>) => {
  const s = map[label] || { bg: '#e2e8f0', color: '#334155' };
  return `<span style="display:inline-block;padding:2px 7px;border-radius:3px;font-size:10px;font-weight:700;background:${s.bg};color:${s.color};">${label || '—'}</span>`;
};

const photoToBase64 = (url: string): Promise<string> =>
  new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      try { resolve(c.toDataURL('image/jpeg', 0.8)); } catch { resolve(''); }
    };
    img.onerror = () => resolve('');
    img.src = url + (url.includes('?') ? '&' : '?') + '_pdf=1';
  });

export const generateInventoryPDF = async (inventory: Inventory, logoUrl: string): Promise<Blob> => {

  // Active rooms (excluding deactivated rooms)
  const activeRoomIds = inventory.activeRoomIds || inventory.rooms.map(r => r.id);
  const activeRooms = inventory.rooms.filter(r => activeRoomIds.includes(r.id) && !r.pdfExcluded);

  // Collect all photos for the appendix (non-excluded items only)
  const photoItems: { roomName: string; itemName: string; url: string; idx: number }[] = [];
  let photoIdx = 1;
  for (const room of activeRooms) {
    for (const item of room.items) {
      if (item.excluded) continue;
      for (const p of item.photos) {
        try {
          const parsed = JSON.parse(p);
          if (parsed?.url) {
            photoItems.push({ roomName: room.name, itemName: item.name, url: parsed.url, idx: photoIdx++ });
          }
        } catch { /* skip */ }
      }
    }
  }

  // Pre-load logo and all photos as base64
  const logoB64 = await photoToBase64(logoUrl);
  const photoB64Map: Record<string, string> = {};
  await Promise.all(photoItems.map(async p => {
    photoB64Map[p.url] = await photoToBase64(p.url);
  }));

  // Build room photo maps for inline thumbnails
  const roomPhotoMap: Record<string, Record<string, string[]>> = {};
  for (const room of activeRooms) {
    roomPhotoMap[room.id] = {};
    for (const item of room.items) {
      if (item.excluded) continue;
      const urls: string[] = [];
      for (const p of item.photos) {
        try {
          const parsed = JSON.parse(p);
          if (parsed?.url && photoB64Map[parsed.url]) urls.push(photoB64Map[parsed.url]);
        } catch { /* skip */ }
      }
      roomPhotoMap[room.id][item.id] = urls;
    }
  }

  // ── Build HTML ──────────────────────────────────────────────────────────────

  const S = {
    page: 'font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1e293b;background:#fff;width:794px;padding:48px 48px 40px;box-sizing:border-box;',
    header: 'text-align:center;border-bottom:3px double #d4af37;padding-bottom:20px;margin-bottom:28px;',
    sectionTitle: 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#d4af37;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin:24px 0 12px;',
    table: 'width:100%;border-collapse:collapse;font-size:11px;',
    td: 'padding:7px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top;',
    tdLabel: 'padding:7px 8px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#64748b;width:35%;vertical-align:top;',
    roomHeader: 'background:#0f172a;color:#fff;padding:8px 14px;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-top:20px;',
    floorHeader: 'background:#334155;color:#e2e8f0;padding:5px 14px;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin-top:28px;',
    itemRow: 'display:grid;grid-template-columns:180px 1fr 90px 90px;gap:8px;padding:8px 10px;border-bottom:1px solid #f1f5f9;align-items:start;font-size:11px;',
    itemHeader: 'display:grid;grid-template-columns:180px 1fr 90px 90px;gap:8px;padding:6px 10px;background:#f8fafc;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;',
    photosRow: 'padding:4px 10px 10px;display:flex;gap:6px;flex-wrap:wrap;background:#fafafa;border-bottom:1px solid #f1f5f9;',
  };

  const rows = (pairs: [string, string][]) => pairs
    .filter(([, v]) => v && v !== '—')
    .map(([k, v]) => `<tr><td style="${S.tdLabel}">${k}</td><td style="${S.td}">${v}</td></tr>`)
    .join('');

  const roomSections = activeRooms.map(room => {
    const visibleItems = room.items.filter(i => !i.excluded);
    if (visibleItems.length === 0) return '';

    const isMeter = room.name === 'Meter Cupboard';

    const itemRows = visibleItems.map(item => {
      const thumbs = (roomPhotoMap[room.id]?.[item.id] || [])
        .map(b64 => `<img src="${b64}" style="width:52px;height:52px;object-fit:cover;border-radius:3px;border:1px solid #e2e8f0;" />`)
        .join('');

      const desc = [
        item.description ? `<div style="color:#475569;">${item.description}</div>` : '',
        item.make ? `<div style="color:#94a3b8;font-size:10px;">Make: ${item.make}${item.model ? ` / ${item.model}` : ''}</div>` : '',
        item.serialNumber ? `<div style="color:#94a3b8;font-size:10px;">Serial: ${item.serialNumber}</div>` : '',
        item.accountNumber ? `<div style="color:#94a3b8;font-size:10px;">Account: ${item.accountNumber}</div>` : '',
        item.qualityTier ? `<div style="color:#94a3b8;font-size:10px;">Quality: ${item.qualityTier}</div>` : '',
        item.installedDate ? `<div style="color:#94a3b8;font-size:10px;">Installed: ${item.installedDate}</div>` : '',
      ].join('');

      const condCol = isMeter
        ? (item.supplier ? `<div style="font-size:10px;color:#475569;">${item.supplier}</div>` : '<span style="color:#cbd5e1;">—</span>')
        : badge(item.condition, COND_STYLE);
      const cleanCol = isMeter
        ? (item.meterType ? `<div style="font-size:10px;color:#475569;">${item.meterType}</div>` : '<span style="color:#cbd5e1;">—</span>')
        : badge(item.cleanliness, CLEAN_STYLE);

      return `
        <div style="${S.itemRow}">
          <div style="font-weight:700;color:#1e293b;">${item.name}</div>
          <div>${desc || '<span style="color:#cbd5e1;">—</span>'}</div>
          <div>${condCol}</div>
          <div>${cleanCol}</div>
        </div>
        ${thumbs ? `<div style="${S.photosRow}">${thumbs}</div>` : ''}
      `;
    }).join('');

    const roomMeta = [
      room.odourNotes ? `<span><b>Odour:</b> ${room.odourNotes}</span>` : '',
      room.decorationColour ? `<span><b>Decoration:</b> ${room.decorationColour}</span>` : '',
      room.lastDecorated ? `<span><b>Last decorated:</b> ${room.lastDecorated}</span>` : '',
    ].filter(Boolean).join(' &nbsp;·&nbsp; ');

    return `
      <div style="${S.roomHeader}">${room.name} <span style="font-size:10px;font-weight:400;opacity:0.7;">(${visibleItems.length} items)</span></div>
      ${roomMeta ? `<div style="padding:5px 10px;background:#fffbeb;font-size:10px;color:#854d0e;border-bottom:1px solid #fde68a;">${roomMeta}</div>` : ''}
      <div style="${S.itemHeader}">
        <div>Item</div><div>Description / Details</div><div>${isMeter ? 'Supplier' : 'Condition'}</div><div>${isMeter ? 'Type' : 'Cleanliness'}</div>
      </div>
      ${itemRows}
    `;
  }).join('');

  // HS checks table
  const hsRows = inventory.healthSafetyChecks.map(c => {
    const ans = c.answer || '—';
    const ansColor = ans === 'YES' ? '#16a34a' : ans === 'NO' ? '#dc2626' : '#64748b';
    return `<tr>
      <td style="${S.td}">${c.question}</td>
      <td style="${S.td};text-align:center;font-weight:700;color:${ansColor};">${ans}</td>
    </tr>`;
  }).join('');

  // Photo appendix
  const appendixPhotos = photoItems.map(p => {
    const b64 = photoB64Map[p.url];
    if (!b64) return '';
    return `
      <div style="break-inside:avoid;margin-bottom:12px;width:180px;">
        <img src="${b64}" style="width:180px;height:130px;object-fit:cover;border-radius:4px;border:1px solid #e2e8f0;display:block;" />
        <div style="background:#0f172a;color:#fff;font-size:9px;font-weight:700;padding:3px 6px;border-radius:0 0 4px 4px;">
          #${p.idx} · ${p.roomName}
        </div>
        <div style="font-size:9px;color:#64748b;padding:2px 0;">${p.itemName}</div>
      </div>
    `;
  }).join('');

  const sigRows = inventory.signatures.map(sig => `
    <tr>
      <td style="${S.tdLabel}">${sig.type}${sig.name ? ` — ${sig.name}` : ''}</td>
      <td style="${S.td}">
        ${sig.data ? `<img src="${sig.data}" style="max-width:200px;height:60px;object-fit:contain;" />` : '<span style="color:#94a3b8;">Not signed</span>'}
        <div style="font-size:10px;color:#94a3b8;margin-top:2px;">${sig.date ? new Date(sig.date).toLocaleString('en-GB') : ''}</div>
      </td>
    </tr>
  `).join('');

  const html = `
    <div style="${S.page}">

      <!-- HEADER -->
      <div style="${S.header}">
        ${logoB64 ? `<img src="${logoB64}" style="width:90px;height:auto;margin:0 auto 12px;display:block;" />` : ''}
        <div style="font-size:20px;font-weight:700;text-transform:uppercase;letter-spacing:3px;color:#0f172a;margin-bottom:4px;">
          Inventory &amp; Schedule of Condition
        </div>
        <div style="font-size:13px;color:#64748b;">${inventory.address}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px;">
          Date: ${new Date(inventory.dateCreated).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}
          &nbsp;·&nbsp; Ref: ${inventory.propertyId || '—'}
        </div>
      </div>

      <!-- PROPERTY DETAILS -->
      <div style="${S.sectionTitle}">1. Property Details</div>
      <table style="${S.table}">
        <tbody>
          ${rows([
            ['Property Address', inventory.address],
            ['Property ID', inventory.propertyId || '—'],
            ['Property Type', inventory.propertyType || '—'],
            ['Property Description', inventory.propertyDescription || '—'],
            ['Pre-Tenancy Clean', inventory.preTenancyClean ? `Yes${inventory.preTenancyCleanDate ? ` — ${inventory.preTenancyCleanDate}` : ''}${inventory.preTenancyCleanInvoiceRef ? ` (Inv: ${inventory.preTenancyCleanInvoiceRef})` : ''}` : 'Not recorded'],
          ])}
        </tbody>
      </table>

      <!-- HEALTH & SAFETY -->
      <div style="${S.sectionTitle}">2. Health &amp; Safety Alarm Compliance Checks</div>
      <table style="${S.table}">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:7px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;border-bottom:1px solid #e2e8f0;">Check</th>
            <th style="padding:7px 8px;text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;border-bottom:1px solid #e2e8f0;width:80px;">Result</th>
          </tr>
        </thead>
        <tbody>${hsRows}</tbody>
      </table>

      <!-- CONDITION / CLEANLINESS KEY -->
      <div style="${S.sectionTitle}">3. Condition &amp; Cleanliness Key</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:8px;">
        <div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;margin-bottom:6px;">Condition</div>
          ${Object.entries(COND_STYLE).map(([label, s]) =>
            `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:11px;">
              <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${s.bg};flex-shrink:0;"></span>
              <span>${label}</span>
            </div>`).join('')}
        </div>
        <div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;margin-bottom:6px;">Cleanliness</div>
          ${Object.entries(CLEAN_STYLE).map(([label, s]) =>
            `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:11px;">
              <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${s.bg};flex-shrink:0;"></span>
              <span>${label}</span>
            </div>`).join('')}
        </div>
      </div>

      <!-- ROOMS -->
      <div style="${S.sectionTitle}">4. Room-by-Room Schedule</div>
      ${roomSections}

      <!-- SIGNATURES -->
      ${inventory.signatures.length > 0 ? `
        <div style="${S.sectionTitle}">5. Signatures</div>
        <table style="${S.table}"><tbody>${sigRows}</tbody></table>
      ` : ''}

      <!-- PHOTO APPENDIX -->
      ${photoItems.length > 0 ? `
        <div style="${S.sectionTitle}">Appendix: Photo Schedule</div>
        <div style="display:flex;flex-wrap:wrap;gap:12px;">
          ${appendixPhotos}
        </div>
      ` : ''}

      <!-- FOOTER -->
      <div style="margin-top:40px;padding-top:12px;border-top:1px solid #e2e8f0;text-align:center;font-size:10px;color:#94a3b8;">
        Bergason Property Services &nbsp;·&nbsp; inventory@bergason.co.uk &nbsp;·&nbsp;
        Generated ${new Date().toLocaleString('en-GB', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}
      </div>

    </div>
  `;

  // ── Render to canvas ────────────────────────────────────────────────────────
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;top:0;left:-10000px;z-index:-1;';
  container.innerHTML = html;
  document.body.appendChild(container);

  await new Promise(r => setTimeout(r, 300)); // let images render

  try {
    const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      imageTimeout: 30000,
      // No onclone needed — template has zero oklch, pure inline hex styles
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height / canvas.width) * pageW;
    const pages = Math.ceil(imgH / pageH);
    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    for (let page = 0; page < pages; page++) {
      if (page > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, -(page * pageH), pageW, imgH);
    }

    return pdf.output('blob');
  } finally {
    document.body.removeChild(container);
  }
};
