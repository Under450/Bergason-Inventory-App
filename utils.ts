export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9);
};

export const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

export const formatDateTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const compressImage = (base64: string, maxWidth = 800): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(base64);

      const ratio = maxWidth / img.width;
      const width = maxWidth;
      const height = img.height * ratio;

      canvas.width = width;
      canvas.height = height;

      ctx.drawImage(img, 0, 0, width, height);
      
      // Add Watermark
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.fillRect(width - 200, height - 30, 190, 25);
      ctx.font = "12px Arial";
      ctx.fillStyle = "black";
      ctx.textAlign = "right";
      ctx.fillText(formatDateTime(Date.now()), width - 15, height - 12);

      resolve(canvas.toDataURL('image/jpeg', 0.7)); // 70% quality jpeg
    };
  });
};
