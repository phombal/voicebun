'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
              <img 
                src="/VoiceBun-White.png" 
                alt="VoiceBun" 
                className="h-10 w-auto cursor-pointer"
              />
            </Link>
          </div>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-4">
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
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeMobileMenu}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
            />
            
            {/* Sidebar */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3 }}
              className="fixed top-0 right-0 h-full w-80 bg-gray-900/95 backdrop-blur-md z-50 md:hidden shadow-2xl"
            >
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10">
                  <Link href="/" onClick={closeMobileMenu}>
                    <img 
                      src="/VoiceBun-White.png" 
                      alt="VoiceBun" 
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
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
} 