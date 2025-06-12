import React, { useState } from 'react';

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
          
          // Check for account limit related errors
          if (error.message.includes('verification') || error.message.includes('account level') || error.message.includes('limit')) {
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
            ${showUpgradeAction ? '<div class="text-xs opacity-75 mt-1">Please upgrade your Telnyx account verification or contact support.</div>' : ''}
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
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-4xl max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <h2 className="text-xl font-semibold text-white">Available Phone Numbers</h2>
            <button
              onClick={fetchTelnyxNumbers}
              disabled={isLoadingTelnyxNumbers}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors flex items-center space-x-2"
            >
              {isLoadingTelnyxNumbers ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                  <span>Refreshing...</span>
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Refresh</span>
                </>
              )}
            </button>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {isLoadingTelnyxNumbers ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-3 text-gray-300">Loading available numbers...</span>
          </div>
        ) : telnyxNumbers.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <p className="text-gray-400">No phone numbers available</p>
            <p className="text-gray-500 text-sm mt-1">Please try again later</p>
          </div>
        ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto">

            
            <div className="text-sm text-gray-400 mb-4">
              Found {telnyxNumbers.length} available phone number{telnyxNumbers.length !== 1 ? 's' : ''} 
              <span className="text-green-400 ml-2">• Live from Telnyx • Just refreshed</span>
            </div>
            
            {telnyxNumbers.map((number, index) => (
              <div
                key={index}
                className="bg-gray-700 rounded-lg p-4 hover:bg-gray-650 transition-colors"
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
                        <p className="text-white font-medium text-lg">{number.phone_number}</p>
                        <div className="flex items-center space-x-4 text-sm text-gray-400">
                          {number.record_type && (
                            <span className="capitalize">{number.record_type}</span>
                          )}
                          {number.region_information?.[0]?.region_name && (
                            <span>{number.region_information[0].region_name}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Features */}
                    {number.features && number.features.length > 0 && (
                      <div className="mt-3">
                        <div className="flex flex-wrap gap-2">
                          {number.features.map((feature, featureIndex) => (
                            <span
                              key={featureIndex}
                              className="px-2 py-1 bg-blue-600 bg-opacity-20 text-blue-300 text-xs rounded-full"
                            >
                              {feature.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Cost Information */}
                    {number.cost_information && (
                      <div className="mt-3 text-sm text-gray-400">
                        {number.cost_information.monthly_cost && (
                          <span className="mr-4">Monthly: {number.cost_information.monthly_cost}</span>
                        )}
                        {number.cost_information.upfront_cost && (
                          <span>Setup: {number.cost_information.upfront_cost}</span>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleSelectNumber(number.phone_number)}
                    disabled={isPurchasing === number.phone_number}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center space-x-2"
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

        <div className="flex justify-end mt-6 pt-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
} 