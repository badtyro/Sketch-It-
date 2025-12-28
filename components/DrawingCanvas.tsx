
import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';

interface DrawingCanvasProps {
  color: string;
  lineWidth: number;
  isActive: boolean;
}

export interface DrawingCanvasHandle {
  clear: () => void;
}

const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(({ color, lineWidth, isActive }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });

  useImperativeHandle(ref, () => ({
    clear: () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }));

  const getPos = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    } else {
      return {
        x: (e as MouseEvent).clientX - rect.left,
        y: (e as MouseEvent).clientY - rect.top
      };
    }
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isActive) return;
    setIsDrawing(true);
    setLastPos(getPos(e));
  };

  const draw = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDrawing || !isActive) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const currentPos = getPos(e);

    ctx.beginPath();
    ctx.moveTo(lastPos.x, lastPos.y);
    ctx.lineTo(currentPos.x, currentPos.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    setLastPos(currentPos);
  }, [isDrawing, lastPos, color, lineWidth, isActive]);

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseMove = (e: MouseEvent) => draw(e);
    const handleTouchMove = (e: TouchEvent) => {
      if (isActive) e.preventDefault();
      draw(e);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopDrawing);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', stopDrawing);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopDrawing);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', stopDrawing);
    };
  }, [draw, isActive]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        // Only resize if significantly different to avoid clearing on mobile keyboard popups
        if (Math.abs(canvas.width - parent.clientWidth) > 10 || Math.abs(canvas.height - parent.clientHeight) > 10) {
          const tempImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
          canvas.width = parent.clientWidth;
          canvas.height = parent.clientHeight;
          ctx.putImageData(tempImage, 0, 0);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        }
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  return (
    <div className="relative w-full h-full bg-white rounded-2xl shadow-inner border-2 border-slate-200 overflow-hidden cursor-crosshair">
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onTouchStart={startDrawing}
        className="block w-full h-full"
      />
    </div>
  );
});

export default DrawingCanvas;
