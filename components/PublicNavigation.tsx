'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function PublicNavigation() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      setScrolled(scrollPosition > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
      scrolled 
        ? 'bg-black/90 backdrop-blur-md shadow-lg' 
        : 'bg-transparent'
    }`}>
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center">
          <Link href="/">
            <img 
              src="/VoiceBun-White.png" 
              alt="VoiceBun" 
              className="h-10 w-auto cursor-pointer"
            />
          </Link>
        </div>
        <div className="flex items-center space-x-4">
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
  );
} 