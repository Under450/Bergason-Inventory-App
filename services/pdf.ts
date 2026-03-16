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
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      imageTimeout: 20000,
      onclone: (clonedDoc) => {
        // Ensure all images in the cloned document have crossOrigin set
        clonedDoc.querySelectorAll<HTMLImageElement>('img').forEach(img => {
          img.crossOrigin = 'anonymous';
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
