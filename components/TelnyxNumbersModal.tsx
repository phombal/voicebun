import React, { useState } from 'react';

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

  const fetchTelnyxNumbers = async () => {
    setIsLoadingTelnyxNumbers(true);
    try {
      const response = await fetch('/api/telnyx-numbers');
      if (!response.ok) {
        throw new Error('Failed to fetch Telnyx phone numbers');
      }
      const data = await response.json();
      console.log('📱 Telnyx API response:', data);
      
      // The Telnyx API returns data in data.data array
      const numbers = data.data || [];
      setTelnyxNumbers(numbers);
      console.log('📱 Available Telnyx numbers:', numbers.length);
    } catch (error) {
      console.error('Error fetching Telnyx numbers:', error);
      // Show error notification
      const notification = document.createElement('div');
      notification.textContent = 'Failed to load Telnyx phone numbers. Please try again.';
      notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
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

  const checkAccountStatus = async () => {
    try {
      console.log('🔍 Checking Telnyx account status...');
      
      const response = await fetch('/api/telnyx-account-status', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to check account status');
      }

      const result = await response.json();
      console.log('✅ Account status:', result);

      // Show account status notification
      const notification = document.createElement('div');
      notification.innerHTML = `
        <div class="flex items-start space-x-3">
          <div class="w-6 h-6 bg-white bg-opacity-20 rounded-full flex items-center justify-center mt-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <div class="flex-1">
            <div class="font-medium">Account Status</div>
            <div class="text-sm opacity-90 mt-1">
              <div>Company: ${result.account?.company_name || 'Not set'}</div>
              <div>Balance: ${result.account?.balance || 'N/A'} ${result.account?.currency || ''}</div>
              <div>Phone Search: ${result.permissions?.phoneNumberSearch?.canSearch ? '✅ Allowed' : '❌ Blocked'}</div>
            </div>
            ${result.recommendations?.length > 0 ? `
              <div class="text-xs opacity-75 mt-2">
                <div class="font-medium">Recommendations:</div>
                ${result.recommendations.map((rec: string) => `<div>• ${rec}</div>`).join('')}
              </div>
            ` : ''}
          </div>
        </div>
      `;
      notification.className = 'fixed top-4 right-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-lg';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 10000);

    } catch (error) {
      console.error('❌ Error checking account status:', error);
      
      // Show error notification
      const notification = document.createElement('div');
      notification.innerHTML = `
        <div class="flex items-center space-x-3">
          <div class="w-6 h-6 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </div>
          <div>
            <div class="font-medium">Status Check Failed</div>
            <div class="text-sm opacity-90">${error instanceof Error ? error.message : 'Unknown error occurred'}</div>
          </div>
        </div>
      `;
      notification.className = 'fixed top-4 right-4 bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-sm';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 6000);
    }
  };



  const handleSelectNumber = async (phoneNumber: string) => {
    if (!userId || !projectId) {
      // Show error notification
      const notification = document.createElement('div');
      notification.textContent = 'User ID and Project ID are required to purchase a phone number';
      notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 max-w-sm';
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
      notification.className = 'fixed top-4 right-4 bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-sm';
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
      notification.className = 'fixed top-4 right-4 bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-md';
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 w-full max-w-4xl max-h-[80vh] overflow-hidden border border-white/20">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <h2 className="text-xl font-semibold text-black">Available Phone Numbers</h2>
          </div>
          <button
            onClick={onClose}
            className="text-black/70 hover:text-black transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {isLoadingTelnyxNumbers ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
            <span className="ml-3 text-black/70">Loading available numbers...</span>
          </div>
        ) : telnyxNumbers.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-black/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-black/20">
              <svg className="w-8 h-8 text-black/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <p className="text-black/70">No phone numbers available</p>
            <p className="text-black/50 text-sm mt-1">Please try again later</p>
          </div>
        ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto">

            
            <div className="text-sm text-black/70 mb-4">
              Found {telnyxNumbers.length} available phone number{telnyxNumbers.length !== 1 ? 's' : ''} 
            </div>
            
            {telnyxNumbers.map((number, index) => (
              <div
                key={index}
                className="bg-black/5 rounded-lg p-4 hover:bg-black/10 transition-colors border border-black/20"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-black font-medium text-lg">{formatPhoneNumber(number.phone_number)}</p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleSelectNumber(number.phone_number)}
                    disabled={isPurchasing === number.phone_number}
                    className="px-4 py-2 bg-black hover:bg-gray-800 disabled:bg-black/50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center space-x-2"
                  >
                    {isPurchasing === number.phone_number ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Purchasing...</span>
                      </>
                    ) : (
                      <span>Select</span>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-6 pt-4 border-t border-black/20">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-black/10 hover:bg-black/20 text-black font-medium rounded-lg transition-colors border border-black/20"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
} 