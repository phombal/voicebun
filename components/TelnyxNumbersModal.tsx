import React, { useState } from 'react';
import { LoadingSpinner } from './LoadingBun';

// Function to format phone number in standard US format
const formatPhoneNumber = (phoneNumber: string): string => {
  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, '');
  
  // Check if it's a US number (11 digits starting with 1)
  if (digits.length === 11 && digits.startsWith('1')) {
    const areaCode = digits.slice(1, 4);
    const exchange = digits.slice(4, 7);
    const number = digits.slice(7, 11);
    return `+1 (${areaCode}) ${exchange}-${number}`;
  }
  
  // For other formats, just return the original
  return phoneNumber;
};

interface TelnyxNumber {
  phone_number: string;
  record_type: string;
  region_information?: Array<{ region_name?: string }>;
  cost_information?: {
    monthly_cost?: string;
    upfront_cost?: string;
  };
  features?: Array<{ name: string }>;
}

interface TelnyxNumbersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectNumber: (phoneNumber: string) => void;
  userId?: string;
  projectId?: string;
}

export function TelnyxNumbersModal({ isOpen, onClose, onSelectNumber, userId, projectId }: TelnyxNumbersModalProps) {
  const [telnyxNumbers, setTelnyxNumbers] = useState<TelnyxNumber[]>([]);
  const [isLoadingTelnyxNumbers, setIsLoadingTelnyxNumbers] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState<string | null>(null);
  const [filterPattern, setFilterPattern] = useState<string>('');

  const fetchTelnyxNumbers = async (startsWith?: string) => {
    setIsLoadingTelnyxNumbers(true);
    try {
      // Build query parameters for filters
      const params = new URLSearchParams();
      if (startsWith?.trim()) {
        params.append('starts_with', startsWith.trim());
      }

      const url = `/api/telnyx-numbers${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch Telnyx phone numbers');
      }
      const data = await response.json();
      console.log('📱 Telnyx API response:', data);
      
      // The Telnyx API returns data in data.data array
      const numbers = data.data || [];
      setTelnyxNumbers(numbers);
      console.log('📱 Available Telnyx numbers:', numbers.length);
      
      // Only show error notification for actual API failures, not when there are no numbers
    } catch (error) {
      console.error('Error fetching Telnyx numbers:', error);
      // Clear the numbers array on error
      setTelnyxNumbers([]);
      // Show error notification only for actual API errors
      const notification = document.createElement('div');
      notification.textContent = 'Failed to load Telnyx phone numbers. Please try again.';
      notification.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 3000);
    } finally {
      setIsLoadingTelnyxNumbers(false);
    }
  };

  // Fetch numbers when modal opens - ALWAYS fetch fresh to avoid stale data
  React.useEffect(() => {
    if (isOpen) {
      fetchTelnyxNumbers();
    }
  }, [isOpen]);

  const handleSelectNumber = async (phoneNumber: string) => {
    if (!userId || !projectId) {
      // Show error notification
      const notification = document.createElement('div');
      notification.textContent = 'User ID and Project ID are required to purchase a phone number';
      notification.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 max-w-sm';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 4000);
      return;
    }

    setIsPurchasing(phoneNumber);

    try {
      console.log('📱 Purchasing phone number:', phoneNumber);

      // REAL PURCHASE: Actual API call to Telnyx
      const response = await fetch('/api/telnyx-direct-purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber,
          userId,
          projectId
          // mockPurchase flag removed - this will be a real purchase
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || 'Failed to purchase phone number');
      }

      const result = await response.json();
      console.log('✅ Phone number purchased successfully:', result);

      // Call the original callback with the phone number
      onSelectNumber(phoneNumber);
      onClose();

      // Show success notification
      const notification = document.createElement('div');
      notification.innerHTML = `
        <div class="flex items-center space-x-3">
          <div class="w-6 h-6 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <div>
            <div class="font-medium">✅ Phone Number Purchased!</div>
            <div class="text-sm opacity-90">${phoneNumber} purchased and assigned successfully.</div>
          </div>
        </div>
      `;
      notification.className = 'fixed bottom-4 right-4 bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-sm';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 6000);

    } catch (error) {
      console.error('❌ Error purchasing phone number:', error);
      
      let errorMessage = 'Unknown error occurred';
      let errorTitle = 'Purchase Failed';
      let showUpgradeAction = false;
      
      if (error instanceof Error) {
        try {
          // Try to parse the error message as JSON if it contains structured error info
          const errorResponse = JSON.parse(error.message);
          if (errorResponse.error) {
            errorTitle = errorResponse.error;
            errorMessage = errorResponse.details || errorResponse.error;
            showUpgradeAction = errorResponse.upgradeUrl || errorResponse.supportAction;
          }
        } catch {
          // If not JSON, use the error message directly
          errorMessage = error.message;
          
          // Check for credit/payment related errors
          if (error.message.includes('credit') || error.message.includes('funds') || error.message.includes('insufficient')) {
            errorTitle = 'Purchase Failed';
            errorMessage = 'There was an issue processing your purchase. Please contact support for assistance.';
            showUpgradeAction = false;
          }
          // Check for account limit related errors
          else if (error.message.includes('verification') || error.message.includes('account level') || error.message.includes('limit')) {
            errorTitle = 'Account Verification Required';
            showUpgradeAction = true;
          }
        }
      }
      
      // Show error notification
      const notification = document.createElement('div');
      notification.innerHTML = `
        <div class="flex items-start space-x-3">
          <div class="w-6 h-6 bg-white bg-opacity-20 rounded-full flex items-center justify-center mt-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </div>
          <div class="flex-1">
            <div class="font-medium">${errorTitle}</div>
            <div class="text-sm opacity-90">${errorMessage}</div>
            ${showUpgradeAction ? '<div class="text-xs opacity-75 mt-1">Please contact support for assistance with account verification.</div>' : ''}
          </div>
        </div>
      `;
      notification.className = 'fixed bottom-4 right-4 bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-md';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 6000);
    } finally {
      setIsPurchasing(null);
    }
  };

  const handleApplyFilters = () => {
    fetchTelnyxNumbers(filterPattern);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-black border border-white/20 rounded-xl p-6 w-full max-w-4xl max-h-[80vh] overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white">Available Phone Numbers</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white hover:bg-white/10 rounded-lg p-2 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filter Input */}
        <div className="mb-6">
          <div className="flex items-center space-x-4">
            {/* Pattern Filter */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-white/70 mb-2">
                Numbers Starting With
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={filterPattern}
                  onChange={(e) => setFilterPattern(e.target.value)}
                  placeholder="Enter pattern (e.g., 555, 212, TACO)"
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                  <svg className="w-5 h-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-xs text-white/50 mt-1">
                Filter numbers that start with your desired pattern.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col justify-end space-y-2">
              <button
                onClick={handleApplyFilters}
                disabled={isLoadingTelnyxNumbers}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors whitespace-nowrap flex items-center space-x-2"
              >
                {isLoadingTelnyxNumbers ? (
                  <>
                    <LoadingSpinner size="sm" color="white" />
                    <span>Loading...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <span>Apply Filters</span>
                  </>
                )}
              </button>

              {filterPattern && (
                <button
                  onClick={() => {
                    setFilterPattern('');
                    fetchTelnyxNumbers(); // Fetch all numbers without filters
                  }}
                  className="px-6 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-white/70 hover:text-white transition-colors whitespace-nowrap text-sm"
                >
                  Clear Filter
                </button>
              )}
            </div>
          </div>
        </div>

        {isLoadingTelnyxNumbers ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center space-y-4">
              <LoadingSpinner size="lg" color="white" />
              <span className="text-white/70">Loading available numbers...</span>
            </div>
          </div>
        ) : telnyxNumbers.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/20">
              <svg className="w-8 h-8 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <p className="text-white/70 font-medium">No phone numbers available</p>
            <p className="text-white/50 text-sm mt-1">
              {filterPattern 
                ? `No numbers found starting with "${filterPattern}". Try a different pattern or contact support.`
                : 'Please try again later or contact support'
              }
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-thin smooth-scroll">
            <div className="text-sm text-white/60 mb-4 px-1">
              {filterPattern ? (
                <>
                  Found {telnyxNumbers.length} number{telnyxNumbers.length !== 1 ? 's' : ''} starting with "{filterPattern}"
                </>
              ) : (
                <>
                  Found {telnyxNumbers.length} available phone number{telnyxNumbers.length !== 1 ? 's' : ''} 
                </>
              )}
            </div>
            
            {telnyxNumbers.map((number, index) => (
              <div
                key={index}
                className="bg-white/5 hover:bg-white/10 rounded-lg p-4 transition-colors border border-white/10 hover:border-white/20"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-white font-medium text-lg">{formatPhoneNumber(number.phone_number)}</p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleSelectNumber(number.phone_number)}
                    disabled={isPurchasing === number.phone_number}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center space-x-2 shadow-lg"
                  >
                    {isPurchasing === number.phone_number ? (
                      <>
                        <LoadingSpinner size="sm" color="white" />
                        <span>Purchasing...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Select</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
} 