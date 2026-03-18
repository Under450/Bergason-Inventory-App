import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Preloads all <img> elements inside an element with crossOrigin="anonymous"
 * so html2canvas can read their pixel data without tainting the canvas.
 */
const preloadImages = (element: HTMLElement): Promise<void[]> => {
  const imgs = Array.from(element.querySelectorAll<HTMLImageElement>('img'));
  return Promise.allSettled(
    imgs.map(img => {
      img.crossOrigin = 'anonymous';
      // Force reload to pick up CORS headers (bypass cache entry without CORS)
      const src = img.src;
      img.src = '';
      img.src = src + (src.includes('?') ? '&' : '?') + '_cors=1';
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>(resolve => {
        img.onload = () => resolve();
        img.onerror = () => resolve(); // Don't fail PDF if one image fails
      });
    })
  ) as unknown as Promise<void[]>;
};

/**
 * Captures an HTML element and returns it as a multi-page A4 PDF blob.
 * Elements with data-pdf-hide attribute are excluded from the output.
 */
export const captureElementAsPDF = async (element: HTMLElement): Promise<Blob> => {
  // Clone so we can strip UI-only elements without touching the live DOM
  const clone = element.cloneNode(true) as HTMLElement;

  clone.querySelectorAll<HTMLElement>('[data-pdf-hide]').forEach(el => el.remove());

  // Make inputs / textareas read as plain text
  clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach(el => {
    el.style.border = 'none';
    el.style.outline = 'none';
    el.style.backgroundColor = 'transparent';
    el.style.resize = 'none';
  });

  // Render off-screen at A4 width (794px ≈ 210mm @ 96 dpi)
  clone.style.position = 'fixed';
  clone.style.top = '0';
  clone.style.left = '-10000px';
  clone.style.width = '794px';
  clone.style.backgroundColor = '#ffffff';
  clone.style.padding = '0';
  clone.style.zIndex = '-1';
  document.body.appendChild(clone);

  // Wait for layout + preload images with CORS
  await new Promise(r => setTimeout(r, 150));
  await preloadImages(clone);

  try {
    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      imageTimeout: 20000,
      onclone: (clonedDoc) => {
        clonedDoc.querySelectorAll<HTMLImageElement>('img').forEach(img => {
          img.crossOrigin = 'anonymous';
        });
        // html2canvas can't parse oklch (used by Tailwind v4) — replace with hex fallbacks
        const style = clonedDoc.createElement('style');
        style.textContent = `
          * { color-scheme: normal !important; }
          :root {
            --tw-color-slate-50: #f8fafc; --tw-color-slate-100: #f1f5f9;
            --tw-color-slate-200: #e2e8f0; --tw-color-slate-300: #cbd5e1;
            --tw-color-slate-400: #94a3b8; --tw-color-slate-500: #64748b;
            --tw-color-slate-600: #475569; --tw-color-slate-700: #334155;
            --tw-color-slate-800: #1e293b; --tw-color-slate-900: #0f172a;
            --tw-color-amber-50: #fffbeb; --tw-color-amber-100: #fef3c7;
            --tw-color-amber-400: #fbbf24; --tw-color-amber-500: #f59e0b;
            --tw-color-green-50: #f0fdf4; --tw-color-green-100: #dcfce7;
            --tw-color-green-500: #22c55e; --tw-color-green-600: #16a34a;
            --tw-color-red-500: #ef4444;
            --tw-color-blue-50: #eff6ff; --tw-color-blue-100: #dbeafe;
          }
        `;
        clonedDoc.head.appendChild(style);
        // Replace any remaining oklch(...) inline styles with transparent
        clonedDoc.querySelectorAll<HTMLElement>('*').forEach(el => {
          const cs = el.getAttribute('style') || '';
          if (cs.includes('oklch')) {
            el.setAttribute('style', cs.replace(/oklch\([^)]+\)/g, 'transparent'));
          }
        });
      },
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
    document.body.removeChild(clone);
  }
};
