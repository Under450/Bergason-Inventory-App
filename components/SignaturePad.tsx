import React, { useRef, useState, useCallback, useEffect } from 'react';
import { getStroke } from 'perfect-freehand';
import { Button } from './Button';

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  onClear?: () => void;
}

interface Point {
  x: number;
  y: number;
  pressure: number;
}

function getSvgPathFromStroke(stroke: number[][]): string {
  if (!stroke.length) return '';
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ['M', ...stroke[0], 'Q']
  );
  d.push('Z');
  return d.join(' ');
}

export const SignaturePad: React.FC<SignaturePadProps> = ({ onSave, onClear }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [allStrokes, setAllStrokes] = useState<Point[][]>([]);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // HiDPI canvas setup
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = container.clientWidth;
      const height = 200;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(ratio, ratio);
      redraw();
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ratio = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio);
    ctx.fillStyle = '#1e293b'; // dark navy ink

    const strokesToRender = [...allStrokes];
    if (currentStroke.length > 0) strokesToRender.push(currentStroke);

    for (const pts of strokesToRender) {
      const outline = getStroke(
        pts.map(p => [p.x, p.y, p.pressure]),
        {
          size: 3.5,
          thinning: 0.6,
          smoothing: 0.5,
          streamline: 0.5,
          start: { taper: 10, easing: (t: number) => t * t },
          end: { taper: 10, easing: (t: number) => --t * t * t + 1 },
        }
      );
      const path = getSvgPathFromStroke(outline);
      if (path) {
        ctx.fill(new Path2D(path));
      }
    }
  }, [allStrokes, currentStroke]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 0.5,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    setIsDrawing(true);
    setCurrentStroke([getPoint(e)]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing) return;
    setCurrentStroke(prev => [...prev, getPoint(e)]);
    setHasSignature(true);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentStroke.length > 0) {
      setAllStrokes(prev => [...prev, currentStroke]);
      setCurrentStroke([]);
    }
  };

  const clearCanvas = () => {
    setAllStrokes([]);
    setCurrentStroke([]);
    setHasSignature(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      const ratio = window.devicePixelRatio || 1;
      if (ctx) ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio);
    }
    onClear?.();
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (canvas && hasSignature) {
      onSave(canvas.toDataURL('image/png'));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={containerRef}
        className="border-2 border-dashed border-slate-300 rounded-lg bg-white overflow-hidden touch-none"
        style={{ cursor: 'crosshair' }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{ display: 'block', touchAction: 'none' }}
        />
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={clearCanvas} className="flex-1">Clear</Button>
        <Button onClick={saveSignature} disabled={!hasSignature} className="flex-1">
          Confirm Signature
        </Button>
      </div>
    </div>
  );
};
