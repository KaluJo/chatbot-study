'use client';

import React, { useEffect } from 'react';
import { Button } from './button';
import { X } from 'lucide-react';

interface FullScreenOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

const FullScreenOverlay: React.FC<FullScreenOverlayProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children 
}) => {
  // Handle ESC key to close
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      // Prevent body scroll when overlay is open
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] bg-background">
      {/* Close button - fixed in top right */}
      <div className="fixed top-4 right-4 z-[110]">
        <Button 
          variant="outline" 
          size="icon" 
          onClick={onClose}
          className="bg-background/80 backdrop-blur-sm hover:bg-background border-2"
        >
          <X className="h-5 w-5" />
          <span className="sr-only">Close overlay</span>
        </Button>
      </div>

      {/* Optional title bar */}
      {title && (
        <div className="fixed top-0 left-0 right-16 z-[105] bg-background/80 backdrop-blur-sm border-b px-4 py-3">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        </div>
      )}

      {/* Content - full screen scrollable */}
      <div className="h-full w-full overflow-y-auto">
        {children}
      </div>
    </div>
  );
};

export default FullScreenOverlay;
