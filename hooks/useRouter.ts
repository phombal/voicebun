import { useRouter as useNextRouter } from 'next/navigation';
import { useRef, useCallback } from 'react';

export function useRouter() {
  const router = useNextRouter();
  const isNavigatingRef = useRef(false);
  const lastNavigationRef = useRef<string | null>(null);
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const safePush = useCallback((url: string, options?: { replace?: boolean; forceNavigation?: boolean }) => {
    // Prevent duplicate navigation to the same URL
    if (lastNavigationRef.current === url && !options?.forceNavigation) {
      console.log('🚫 Preventing duplicate navigation to:', url);
      return Promise.resolve();
    }

    // Prevent overlapping navigation calls unless forced
    if (isNavigatingRef.current && !options?.forceNavigation) {
      console.log('🚫 Navigation already in progress, skipping:', url);
      return Promise.resolve();
    }

    console.log('🧭 Starting navigation to:', url);
    isNavigatingRef.current = true;
    lastNavigationRef.current = url;

    // Clear any existing timeout
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
    }

    // Set a timeout to reset navigation state in case of issues
    navigationTimeoutRef.current = setTimeout(() => {
      console.log('⏰ Navigation timeout reached, resetting state');
      isNavigatingRef.current = false;
    }, 5000); // 5 second timeout

    try {
      if (options?.replace) {
        router.replace(url);
      } else {
        router.push(url);
      }
      
      // Reset navigation state after a short delay to allow for navigation to complete
      setTimeout(() => {
        isNavigatingRef.current = false;
        if (navigationTimeoutRef.current) {
          clearTimeout(navigationTimeoutRef.current);
          navigationTimeoutRef.current = null;
        }
      }, 100);

      return Promise.resolve();
    } catch (error) {
      console.error('❌ Navigation error:', error);
      isNavigatingRef.current = false;
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
        navigationTimeoutRef.current = null;
      }
      return Promise.reject(error);
    }
  }, [router]);

  const safeReplace = useCallback((url: string, options?: { forceNavigation?: boolean }) => {
    return safePush(url, { replace: true, ...options });
  }, [safePush]);

  const safeBack = useCallback(() => {
    if (isNavigatingRef.current) {
      console.log('🚫 Navigation already in progress, skipping back()');
      return;
    }

    console.log('🧭 Navigating back');
    isNavigatingRef.current = true;
    
    // Clear any existing timeout
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
    }

    // Set a timeout to reset navigation state
    navigationTimeoutRef.current = setTimeout(() => {
      isNavigatingRef.current = false;
    }, 2000);

    try {
      router.back();
      
      // Reset navigation state after a short delay
      setTimeout(() => {
        isNavigatingRef.current = false;
        if (navigationTimeoutRef.current) {
          clearTimeout(navigationTimeoutRef.current);
          navigationTimeoutRef.current = null;
        }
      }, 100);
    } catch (error) {
      console.error('❌ Back navigation error:', error);
      isNavigatingRef.current = false;
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
        navigationTimeoutRef.current = null;
      }
    }
  }, [router]);

  const safeRefresh = useCallback(() => {
    if (isNavigatingRef.current) {
      console.log('🚫 Navigation already in progress, skipping refresh()');
      return;
    }

    console.log('🧭 Refreshing page');
    isNavigatingRef.current = true;
    
    try {
      router.refresh();
      
      // Reset navigation state after a short delay
      setTimeout(() => {
        isNavigatingRef.current = false;
      }, 100);
    } catch (error) {
      console.error('❌ Refresh error:', error);
      isNavigatingRef.current = false;
    }
  }, [router]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }
    isNavigatingRef.current = false;
  }, []);

  return {
    push: safePush,
    replace: safeReplace,
    back: safeBack,
    refresh: safeRefresh,
    cleanup,
    isNavigating: () => isNavigatingRef.current,
    // Expose original router methods for cases where we need them
    prefetch: router.prefetch,
    forward: router.forward,
  };
} 