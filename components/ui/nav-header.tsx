'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { MessageCircle, Sparkles, LogOut, BrainCircuit, Info } from 'lucide-react';
import { useState } from 'react';
import { isDemoMode } from '@/lib/demo';
import { AboutModal } from '@/components/ui/AboutModal';

const navItems = [
  { href: '/chat', label: 'Chat', icon: MessageCircle },
  { href: '/values', label: 'Values', icon: Sparkles },
  { href: '/agency', label: 'Agency', icon: BrainCircuit },
];

export function NavHeader() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  // Don't show nav on login, setup, admin pages
  // In demo mode, show on /chat too (replaces DemoChatView's own header logic)
  if (
    pathname === '/login' ||
    pathname === '/setup' ||
    pathname === '/' ||
    pathname?.startsWith('/admin') ||
    // Only hide on /chat in non-demo mode (demo mode uses this nav on all pages)
    (!isDemoMode && pathname === '/chat')
  ) {
    return null;
  }

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex-shrink-0">
        <div className="pl-4 max-w-7xl mx-auto grid grid-cols-3 items-center">
          {/* Left — empty in demo, logout in non-demo */}
          <div className="flex items-center">
            {!isDemoMode && (
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 p-2 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                title="Logout"
                aria-label="Logout"
              >
                <LogOut size={22} />
              </button>
            )}
          </div>

          {/* Center — nav tabs always centered */}
          <nav className="flex justify-center items-center gap-0.5 sm:gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  className={`
                    inline-flex items-center gap-1.5 sm:gap-2 px-3 py-2 rounded-full text-sm font-medium
                    transition-all duration-150
                    ${isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }
                  `}
                >
                  <Icon size={22} />
                  <span className="inline">{item.label}</span>
                </Link>
              );
            })}
            <button
              onClick={() => setIsAboutOpen(true)}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 py-2 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-all duration-150"
              aria-label="Info"
            >
              <Info size={22} />
            </button>
          </nav>

          {/* Right — empty */}
          <div />
        </div>
      </header>

      <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
    </>
  );
}
