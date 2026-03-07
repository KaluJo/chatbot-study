'use client';

import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils'; // Assuming you have a utility for classnames

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  // We can add specific props for the scroll area if needed later
  // For example, options for scrollbar visibility, custom styles, etc.
}

const ScrollArea = forwardRef<
  HTMLDivElement,
  ScrollAreaProps
>(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('relative overflow-y-auto', className)} // Basic styling for scrollability
      {...props}
    >
      {children}
      {/* We can add custom scrollbar elements here if we want to style them beyond browser defaults */}
    </div>
  );
});

ScrollArea.displayName = 'ScrollArea';

export { ScrollArea }; 