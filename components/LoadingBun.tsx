'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

interface LoadingBunProps {
  message?: string;
  showTips?: boolean;
  className?: string;
}

export function LoadingBun({ 
  message = "Loading...", 
  className = "min-h-screen bg-black flex items-center justify-center" 
}: LoadingBunProps) {
  const [dots, setDots] = useState(0)
  
  // Animate dots for better visual feedback
  React.useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => (prev + 1) % 4)
    }, 400) // Faster animation for more responsive feel
    return () => clearInterval(interval)
  }, [])

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`${className} transition-opacity duration-300`} 
      style={{ 
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        backgroundColor: '#000000' // Ensure black background
      }}
    >
      <div className="text-center">
        {/* Animated VoiceBun Logo - faster animation */}
        <motion.div
          animate={{ 
            x: [-15, 15, -15], // Reduced movement for subtlety
          }}
          transition={{ 
            duration: 1.5, // Faster animation
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="mb-8"
        >
          <Image 
            src="/VoiceBun-BunOnly.png" 
            alt="VoiceBun" 
            width={96}
            height={96}
            className="mx-auto"
          />
        </motion.div>

        {/* Loading Dots - more responsive animation */}
        <div className="flex justify-center space-x-2 mb-8">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{
                scale: [1, 1.3, 1], // Slightly more pronounced
                opacity: [0.4, 1, 0.4] // Better contrast
              }}
              transition={{
                duration: 1.2, // Faster animation
                repeat: Infinity,
                delay: i * 0.15 // Tighter timing
              }}
              className="w-3 h-3 bg-white rounded-full"
            />
          ))}
        </div>

        {/* Loading Message with animated dots */}
        <div className="text-white/90 text-lg leading-relaxed max-w-md mx-auto">
          <span>{message}</span>
          <span className="inline-block w-8 text-left">
            {'.'.repeat(dots)}
          </span>
        </div>
        
        {/* Subtle progress indicator */}
        <motion.div 
          className="mt-6 mx-auto w-48 h-1 bg-white/10 rounded-full overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          <motion.div
            className="h-full bg-white/30 rounded-full"
            animate={{ 
              x: ['-100%', '100%']
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}

// Full page loading component with tips (for main loading screens)
export function LoadingPageWithTips() {
  const [currentTip, setCurrentTip] = useState<number>(0);
  
  const tips = [
    "💡 Tip: Be specific in your voice agent description for better results",
    "🎯 Tip: You can customize personality, language, and response style",
    "🔊 Tip: Test your agent with different conversation scenarios",
    "⚡ Tip: Use example prompts to get started quickly",
    "🤖 Tip: Your agent will remember context throughout conversations",
    "📝 Tip: Generated code includes all necessary dependencies",
    "🎨 Tip: Agents can handle multiple languages and accents",
    "🔧 Tip: You can modify the generated code after creation"
  ];

  // Rotate tips every 3 seconds
  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTip((prev: number) => (prev + 1) % tips.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [tips.length]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col items-center justify-center bg-black"
      style={{ 
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
      }}
    >
      <div className="text-center">
        {/* Animated VoiceBun Logo */}
        <motion.div
          animate={{ 
            x: [-20, 20, -20],
          }}
          transition={{ 
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="mb-8"
        >
          <Image 
            src="/VoiceBun-BunOnly.png" 
            alt="VoiceBun" 
            width={96}
            height={96}
            className="mx-auto"
          />
        </motion.div>

        {/* Loading Dots */}
        <div className="flex justify-center space-x-2 mb-8">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.5, 1, 0.5]
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.2
              }}
              className="w-3 h-3 bg-white rounded-full"
            />
          ))}
        </div>

        {/* Rotating Tips */}
        <motion.div
          key={currentTip}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.5 }}
          className="max-w-md mx-auto"
        >
          <p className="text-white/90 text-lg leading-relaxed">
            {tips[currentTip]}
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}

// Simple inline loading spinner for buttons and small loading states
export function LoadingSpinner({ 
  size = 'md', 
  color = 'white',
  className = '' 
}: {
  size?: 'sm' | 'md' | 'lg';
  color?: 'white' | 'black' | 'blue' | 'green';
  className?: string;
}) {
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4', 
    lg: 'h-5 w-5'
  };
  
  const colorClasses = {
    white: 'border-white',
    black: 'border-black',
    blue: 'border-blue-400',
    green: 'border-green-400'
  };
  
  return (
    <div 
      className={`animate-spin rounded-full border-b-2 ${sizeClasses[size]} ${colorClasses[color]} ${className}`}
    />
  );
} 