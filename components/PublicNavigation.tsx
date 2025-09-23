'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';

export default function PublicNavigation() {
  const [scrolled, setScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      setScrolled(scrollPosition > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu when clicking outside or on a link
  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobileMenuOpen]);

  return (
    <>
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled 
          ? 'bg-black/90 backdrop-blur-md shadow-lg' 
          : 'bg-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* Mobile Hamburger Button - Left of logo */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden text-white p-2 hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Toggle mobile menu"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
            
            {/* Logo */}
            <Link href="/" onClick={closeMobileMenu}>
              <Image 
                src="/VoiceBun-White.png" 
                alt="VoiceBun" 
                width={120}
                height={40}
                className="h-10 w-auto cursor-pointer"
              />
            </Link>
          </div>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-4">
            <a
              href="https://github.com/phombal/voicebun"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/70 hover:text-white transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              GitHub
            </a>
            <Link
              href="/community"
              className="text-white/70 hover:text-white transition-colors"
            >
              Community
            </Link>
            <Link
              href="/pricing"
              className="text-white/70 hover:text-white transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/auth"
              className="text-white/70 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/auth?mode=signup"
              className="bg-white text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors font-medium"
            >
              Get Started for Free
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile Sidebar Menu */}
        {isMobileMenuOpen && (
          <>
            {/* Backdrop */}
            <div
              onClick={closeMobileMenu}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
            />
            
            {/* Sidebar */}
            <div
              className="fixed top-0 right-0 h-full w-80 bg-gray-900/95 backdrop-blur-md z-50 md:hidden shadow-2xl"
            >
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10">
                  <Link href="/" onClick={closeMobileMenu}>
                    <Image 
                      src="/VoiceBun-White.png" 
                      alt="VoiceBun" 
                      width={96}
                      height={32}
                      className="h-8 w-auto cursor-pointer"
                    />
                  </Link>
                  <button
                    onClick={closeMobileMenu}
                    className="text-white p-2 hover:bg-white/10 rounded-lg transition-colors"
                    aria-label="Close mobile menu"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                {/* Navigation Links */}
                <nav className="flex flex-col p-6 space-y-6 flex-1">
                  <a
                    href="https://github.com/phombal/voicebun"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={closeMobileMenu}
                    className="text-white/70 hover:text-white transition-colors text-lg font-medium py-3 border-b border-white/10 flex items-center gap-3"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.30.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    GitHub
                  </a>
                  <Link
                    href="/community"
                    onClick={closeMobileMenu}
                    className="text-white/70 hover:text-white transition-colors text-lg font-medium py-3 border-b border-white/10"
                  >
                    Community
                  </Link>
                  <Link
                    href="/pricing"
                    onClick={closeMobileMenu}
                    className="text-white/70 hover:text-white transition-colors text-lg font-medium py-3 border-b border-white/10"
                  >
                    Pricing
                  </Link>
                  <Link
                    href="/auth"
                    onClick={closeMobileMenu}
                    className="text-white/70 hover:text-white transition-colors text-lg font-medium py-3 border-b border-white/10"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/auth?mode=signup"
                    onClick={closeMobileMenu}
                    className="block w-full bg-white text-gray-900 px-6 py-4 rounded-lg hover:bg-gray-100 transition-colors font-medium text-center text-lg"
                  >
                    Get Started for Free
                  </Link>
                </nav>

                {/* Empty bottom section - removed CTA button */}
                <div className="p-6 border-t border-white/10">
                </div>
              </div>
            </div>
          </>
        )}
    </>
  );
} 