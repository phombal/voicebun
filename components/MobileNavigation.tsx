import React, { useState } from 'react';

interface MobileNavigationProps {
  activeMenu: 'instructions' | 'models' | 'phone' | 'functions' | 'other';
  setActiveMenu: (menu: 'instructions' | 'models' | 'phone' | 'functions' | 'other') => void;
}

export function MobileNavigation({ 
  activeMenu, 
  setActiveMenu 
}: MobileNavigationProps) {
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  return (
    <>
      {/* Mobile Menu Button */}
      <div className="md:hidden">
        <button
          onClick={() => setShowMobileMenu(!showMobileMenu)}
          className="w-8 h-8 hover:bg-white/10 rounded-lg transition-colors flex items-center justify-center"
          title="Menu"
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Mobile Menu Sidebar */}
      {showMobileMenu && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setShowMobileMenu(false)}>
          <div className="absolute top-0 left-0 w-64 h-full bg-neutral-800 border-r border-white/20" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-white/20">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Menu</h3>
                <button
                  onClick={() => setShowMobileMenu(false)}
                  className="p-1 hover:bg-white/10 rounded transition-colors"
                >
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-4 space-y-2">
              <button
                onClick={() => {
                  setActiveMenu('instructions');
                  setShowMobileMenu(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                  activeMenu === 'instructions' 
                    ? 'bg-white text-black' 
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Instructions</span>
                </div>
              </button>
              
              <button
                onClick={() => {
                  setActiveMenu('models');
                  setShowMobileMenu(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                  activeMenu === 'models' 
                    ? 'bg-white text-black' 
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>Models</span>
                </div>
              </button>
              
              <button
                onClick={() => {
                  setActiveMenu('phone');
                  setShowMobileMenu(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                  activeMenu === 'phone' 
                    ? 'bg-white text-black' 
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span>Phone Numbers</span>
                </div>
              </button>
              
              <button
                onClick={() => {
                  setActiveMenu('functions');
                  setShowMobileMenu(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                  activeMenu === 'functions' 
                    ? 'bg-white text-black' 
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  <span>Functions</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 