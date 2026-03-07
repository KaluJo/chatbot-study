'use client';

import { useState, useEffect } from 'react';

export function useScrollDirection() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let lastY = window.scrollY;
    const THRESHOLD = 200; // px to scroll before triggering

    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY < 10) {
        setVisible(true);
      } else if (currentY - lastY > THRESHOLD) {
        setVisible(false); // scrolled down enough
        lastY = currentY;
      } else if (lastY - currentY > THRESHOLD) {
        setVisible(true);  // scrolled up enough
        lastY = currentY;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return visible;
}
