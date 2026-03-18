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
 * Full Tailwind v4 oklch → hex override style block.
 * html2canvas cannot parse oklch() colour functions — this replaces every
 * Tailwind v4 CSS variable at :root level so computed styles resolve to hex.
 */
const OKLCH_OVERRIDE_CSS = `
  * { color-scheme: normal !important; }
  :root {
    /* Slate */
    --color-slate-50: #f8fafc;   --color-slate-100: #f1f5f9;
    --color-slate-200: #e2e8f0;  --color-slate-300: #cbd5e1;
    --color-slate-400: #94a3b8;  --color-slate-500: #64748b;
    --color-slate-600: #475569;  --color-slate-700: #334155;
    --color-slate-800: #1e293b;  --color-slate-900: #0f172a;
    --color-slate-950: #020617;
    /* Gray */
    --color-gray-50: #f9fafb;    --color-gray-100: #f3f4f6;
    --color-gray-200: #e5e7eb;   --color-gray-300: #d1d5db;
    --color-gray-400: #9ca3af;   --color-gray-500: #6b7280;
    --color-gray-600: #4b5563;   --color-gray-700: #374151;
    --color-gray-800: #1f2937;   --color-gray-900: #111827;
    --color-gray-950: #030712;
    /* Zinc */
    --color-zinc-50: #fafafa;    --color-zinc-100: #f4f4f5;
    --color-zinc-200: #e4e4e7;   --color-zinc-300: #d4d4d8;
    --color-zinc-400: #a1a1aa;   --color-zinc-500: #71717a;
    --color-zinc-600: #52525b;   --color-zinc-700: #3f3f46;
    --color-zinc-800: #27272a;   --color-zinc-900: #18181b;
    --color-zinc-950: #09090b;
    /* Red */
    --color-red-50: #fef2f2;     --color-red-100: #fee2e2;
    --color-red-200: #fecaca;    --color-red-300: #fca5a5;
    --color-red-400: #f87171;    --color-red-500: #ef4444;
    --color-red-600: #dc2626;    --color-red-700: #b91c1c;
    --color-red-800: #991b1b;    --color-red-900: #7f1d1d;
    --color-red-950: #450a0a;
    /* Orange */
    --color-orange-50: #fff7ed;  --color-orange-100: #ffedd5;
    --color-orange-200: #fed7aa; --color-orange-300: #fdba74;
    --color-orange-400: #fb923c; --color-orange-500: #f97316;
    --color-orange-600: #ea580c; --color-orange-700: #c2410c;
    --color-orange-800: #9a3412; --color-orange-900: #7c2d12;
    --color-orange-950: #431407;
    /* Amber */
    --color-amber-50: #fffbeb;   --color-amber-100: #fef3c7;
    --color-amber-200: #fde68a;  --color-amber-300: #fcd34d;
    --color-amber-400: #fbbf24;  --color-amber-500: #f59e0b;
    --color-amber-600: #d97706;  --color-amber-700: #b45309;
    --color-amber-800: #92400e;  --color-amber-900: #78350f;
    --color-amber-950: #451a03;
    /* Yellow */
    --color-yellow-50: #fefce8;  --color-yellow-100: #fef9c3;
    --color-yellow-200: #fef08a; --color-yellow-300: #fde047;
    --color-yellow-400: #facc15; --color-yellow-500: #eab308;
    --color-yellow-600: #ca8a04; --color-yellow-700: #a16207;
    --color-yellow-800: #854d0e; --color-yellow-900: #713f12;
    --color-yellow-950: #422006;
    /* Lime */
    --color-lime-50: #f7fee7;    --color-lime-100: #ecfccb;
    --color-lime-400: #a3e635;   --color-lime-500: #84cc16;
    --color-lime-600: #65a30d;
    /* Green */
    --color-green-50: #f0fdf4;   --color-green-100: #dcfce7;
    --color-green-200: #bbf7d0;  --color-green-300: #86efac;
    --color-green-400: #4ade80;  --color-green-500: #22c55e;
    --color-green-600: #16a34a;  --color-green-700: #15803d;
    --color-green-800: #166534;  --color-green-900: #14532d;
    --color-green-950: #052e16;
    /* Teal */
    --color-teal-50: #f0fdfa;    --color-teal-500: #14b8a6;
    --color-teal-600: #0d9488;
    /* Cyan */
    --color-cyan-50: #ecfeff;    --color-cyan-500: #06b6d4;
    /* Blue */
    --color-blue-50: #eff6ff;    --color-blue-100: #dbeafe;
    --color-blue-200: #bfdbfe;   --color-blue-300: #93c5fd;
    --color-blue-400: #60a5fa;   --color-blue-500: #3b82f6;
    --color-blue-600: #2563eb;   --color-blue-700: #1d4ed8;
    --color-blue-800: #1e40af;   --color-blue-900: #1e3a8a;
    --color-blue-950: #172554;
    /* Indigo */
    --color-indigo-50: #eef2ff;  --color-indigo-500: #6366f1;
    --color-indigo-600: #4f46e5;
    /* Violet / Purple */
    --color-violet-500: #8b5cf6; --color-purple-500: #a855f7;
    /* Pink / Rose */
    --color-pink-500: #ec4899;   --color-rose-500: #f43f5e;
    /* White / Black */
    --color-white: #ffffff;      --color-black: #000000;
    /* Tailwind v4 also exposes these as --tw-* aliases in some builds */
    --tw-color-slate-50: #f8fafc;   --tw-color-slate-100: #f1f5f9;
    --tw-color-slate-200: #e2e8f0;  --tw-color-slate-300: #cbd5e1;
    --tw-color-slate-400: #94a3b8;  --tw-color-slate-500: #64748b;
    --tw-color-slate-600: #475569;  --tw-color-slate-700: #334155;
    --tw-color-slate-800: #1e293b;  --tw-color-slate-900: #0f172a;
    --tw-color-amber-50: #fffbeb;   --tw-color-amber-100: #fef3c7;
    --tw-color-amber-400: #fbbf24;  --tw-color-amber-500: #f59e0b;
    --tw-color-green-50: #f0fdf4;   --tw-color-green-100: #dcfce7;
    --tw-color-green-500: #22c55e;  --tw-color-green-600: #16a34a;
    --tw-color-red-500: #ef4444;
    --tw-color-blue-50: #eff6ff;    --tw-color-blue-100: #dbeafe;
  }
`;

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

        // Inject full oklch → hex override BEFORE any other styles so computed
        // values resolve to hex rather than oklch() which html2canvas cannot parse.
        const overrideStyle = clonedDoc.createElement('style');
        overrideStyle.textContent = OKLCH_OVERRIDE_CSS;
        clonedDoc.head.insertBefore(overrideStyle, clonedDoc.head.firstChild);

        // Walk every element and forcibly resolve any oklch() values in
        // computed styles, writing them back as hex inline styles so
        // html2canvas never sees an oklch() string.
        clonedDoc.querySelectorAll<HTMLElement>('*').forEach(el => {
          try {
            const computed = clonedDoc.defaultView?.getComputedStyle(el);
            if (!computed) return;

            const propsToCheck = [
              'color', 'backgroundColor', 'borderColor',
              'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
              'outlineColor', 'boxShadow', 'fill', 'stroke',
            ];

            propsToCheck.forEach(prop => {
              const val = computed.getPropertyValue(prop);
              if (val && val.includes('oklch')) {
                (el.style as Record<string, string>)[prop] = 'transparent';
              }
            });

            // Also patch any remaining oklch in inline style attribute
            const inlineStyle = el.getAttribute('style') || '';
            if (inlineStyle.includes('oklch')) {
              el.setAttribute('style', inlineStyle.replace(/oklch\([^)]+\)/g, 'transparent'));
            }
          } catch {
            // ignore per-element errors
          }
        });

        // Remove any <link rel="stylesheet"> that points to the Tailwind build —
        // this prevents the oklch variables from being re-introduced by the sheet.
        clonedDoc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach(link => {
          if (link.href.includes('index') || link.href.includes('assets')) {
            link.remove();
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
