import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PhoneNumber } from '@/lib/database/types';
import { db } from '@/lib/database/service';

interface PhoneNumberManagerProps {
  projectId?: string;
  onPhoneNumberAssigned?: (phoneNumber: string, phoneNumberId: string) => void;
  onPurchaseNumber?: () => void;
}

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

export function PhoneNumberManager({ projectId, onPhoneNumberAssigned, onPurchaseNumber }: PhoneNumberManagerProps) {
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState<string | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState<string | null>(null);
  const { user } = useAuth();

  // Load user's phone numbers
  const loadPhoneNumbers = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const numbers = await db.getUserPhoneNumbers();
      console.log('📱 Loaded phone numbers:', numbers);
      setPhoneNumbers(numbers);
    } catch (error) {
      console.error('❌ Error loading phone numbers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPhoneNumbers();
  }, [user]);

  // Connect phone number to project using the assign endpoint
  const connectPhoneNumber = async (phoneNumber: PhoneNumber) => {
    if (!projectId || !user) {
      console.error('❌ Missing projectId or user for connection');
      return;
    }

    setIsConnecting(phoneNumber.id);

    try {
      console.log('🔗 Connecting phone number to project:', {
        phoneNumberId: phoneNumber.id,
        projectId,
        phoneNumber: phoneNumber.phone_number
      });

      const response = await fetch('/api/assign-phone-number', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumberId: phoneNumber.id,
          projectId: projectId,
          userId: user.id,
          sipHost: '6ckp7xx52cn.sip.livekit.cloud'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || 'Connection failed');
      }

      const result = await response.json();
      console.log('✅ Phone number connected successfully:', result);

      // Update the phone number status locally
      setPhoneNumbers(prev => 
        prev.map(pn => 
          pn.id === phoneNumber.id 
            ? { ...pn, status: 'assigned', project_id: projectId }
            : pn
        )
      );

      // Notify parent component
      if (onPhoneNumberAssigned) {
        onPhoneNumberAssigned(phoneNumber.phone_number, phoneNumber.id);
      }

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
            <div class="font-medium">Phone Number Connected!</div>
            <div class="text-sm opacity-90">${phoneNumber.phone_number} has been successfully connected to this project.</div>
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
      console.error('❌ Error connecting phone number:', error);
      
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
            <div class="font-medium">Connection Failed</div>
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
    } finally {
      setIsConnecting(null);
    }
  };

  // Disconnect phone number from project
  const disconnectPhoneNumber = async (phoneNumber: PhoneNumber) => {
    if (!user) {
      console.error('❌ Missing user for disconnection');
      return;
    }

    // Use the phone number's actual project_id from the database, not the current page's projectId
    const actualProjectId = phoneNumber.project_id;
    if (!actualProjectId) {
      console.error('❌ Phone number has no project_id to disconnect from');
      return;
    }

    setIsDisconnecting(phoneNumber.id);

    try {
      console.log('📞 Disconnecting phone number from project:', {
        phoneNumberId: phoneNumber.id,
        phoneNumber: phoneNumber.phone_number,
        actualProjectId,
        currentPageProjectId: projectId
      });

      const response = await fetch('/api/unassign-phone-number', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumberId: phoneNumber.id,
          projectId: actualProjectId, // Use the phone number's actual project_id
          userId: user.id
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || 'Disconnection failed');
      }

      const result = await response.json();
      console.log('✅ Phone number disconnected successfully:', result);

      // Update the phone number status locally
      setPhoneNumbers(prev => 
        prev.map(pn => 
          pn.id === phoneNumber.id 
            ? { ...pn, status: 'available', project_id: null }
            : pn
        )
      );

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
            <div class="font-medium">Phone number disconnected successfully!</div>
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
      console.error('❌ Error disconnecting phone number:', error);
      
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
            <div class="font-medium">Disconnection Failed</div>
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
    } finally {
      setIsDisconnecting(null);
    }
  };

  // Reconnect phone number from another project to current project
  const reconnectPhoneNumber = async (phoneNumber: PhoneNumber) => {
    if (!projectId || !user) {
      console.error('❌ Missing projectId or user for reconnection');
      return;
    }

    const currentProjectId = phoneNumber.project_id;
    if (!currentProjectId) {
      console.error('❌ Phone number has no current project_id to reconnect from');
      return;
    }

    setIsReconnecting(phoneNumber.id);

    try {
      console.log('🔄 Reconnecting phone number to new project:', {
        phoneNumberId: phoneNumber.id,
        fromProjectId: currentProjectId,
        toProjectId: projectId,
        phoneNumber: phoneNumber.phone_number
      });

      // Step 1: Unassign from current project
      console.log('📞 Step 1: Disconnecting from current project...');
      const unassignResponse = await fetch('/api/unassign-phone-number', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumberId: phoneNumber.id,
          projectId: currentProjectId,
          userId: user.id
        }),
      });

      if (!unassignResponse.ok) {
        const errorData = await unassignResponse.json();
        throw new Error(`Disconnect failed: ${errorData.details || errorData.error}`);
      }

      console.log('✅ Step 1 completed: Disconnected from current project');

      // Step 2: Assign to new project
      console.log('🔗 Step 2: Connecting to new project...');
      const assignResponse = await fetch('/api/assign-phone-number', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumberId: phoneNumber.id,
          projectId: projectId,
          userId: user.id,
          sipHost: '6ckp7xx52cn.sip.livekit.cloud'
        }),
      });

      if (!assignResponse.ok) {
        const errorData = await assignResponse.json();
        throw new Error(`Connect failed: ${errorData.details || errorData.error}`);
      }

      const result = await assignResponse.json();
      console.log('✅ Step 2 completed: Connected to new project');
      console.log('✅ Phone number reconnected successfully:', result);

      // Update the phone number status locally
      setPhoneNumbers(prev => 
        prev.map(pn => 
          pn.id === phoneNumber.id 
            ? { ...pn, status: 'assigned', project_id: projectId }
            : pn
        )
      );

      // Notify parent component
      if (onPhoneNumberAssigned) {
        onPhoneNumberAssigned(phoneNumber.phone_number, phoneNumber.id);
      }

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
            <div class="font-medium">Phone Number Reconnected!</div>
            <div class="text-sm opacity-90">${phoneNumber.phone_number} has been successfully moved to this project.</div>
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
      console.error('❌ Error reconnecting phone number:', error);
      
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
            <div class="font-medium">Reconnection Failed</div>
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
    } finally {
      setIsReconnecting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-white/70">Loading phone numbers...</span>
      </div>
    );
  }

  if (phoneNumbers.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-4 border border-white/20">
          <svg className="w-8 h-8 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </div>
        <p className="text-white/70">No phone numbers purchased yet</p>
        <p className="text-white/50 text-sm mt-1 mb-4">Purchase a phone number first to connect it to your project</p>
        {onPurchaseNumber && (
          <button
            onClick={onPurchaseNumber}
            className="px-6 py-3 bg-white hover:bg-gray-100 text-black font-medium rounded-lg transition-colors flex items-center space-x-2 mx-auto"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Purchase Phone Number</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {phoneNumbers.map((phoneNumber) => {
          const isConnectedToCurrentProject = phoneNumber.project_id === projectId;
          const isConnectedToOtherProject = phoneNumber.project_id && phoneNumber.project_id !== projectId;
          
          return (
            <div
              key={phoneNumber.id}
              className="bg-white/10 backdrop-blur-sm rounded-lg p-4 flex items-center justify-between border border-white/20"
            >
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                
                <div>
                  <p className="text-white font-medium">{formatPhoneNumber(phoneNumber.phone_number)}</p>
                  <div className="flex items-center space-x-3 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      isConnectedToCurrentProject
                        ? 'bg-blue-600 text-blue-100'
                        : isConnectedToOtherProject
                        ? 'bg-yellow-600 text-yellow-100'
                        : 'bg-green-600 text-green-100'
                    }`}>
                      {isConnectedToCurrentProject 
                        ? 'connected' 
                        : isConnectedToOtherProject 
                        ? 'connected to other project'
                        : 'available'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                {/* Action buttons */}
                <div className="flex gap-2">
                  {phoneNumber.project_id === projectId ? (
                    <>
                      <button
                        onClick={() => disconnectPhoneNumber(phoneNumber)}
                        disabled={isDisconnecting === phoneNumber.id}
                        className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-sm rounded disabled:opacity-50"
                      >
                        {isDisconnecting === phoneNumber.id ? (
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                            Disconnecting...
                          </div>
                        ) : (
                          'Disconnect'
                        )}
                      </button>
                      <span className="text-green-400 text-sm font-medium flex items-center">
                        Connected
                      </span>
                    </>
                  ) : phoneNumber.project_id ? (
                    // Phone number is connected to another project - show only move to project button
                    <button
                      onClick={() => reconnectPhoneNumber(phoneNumber)}
                      disabled={isReconnecting === phoneNumber.id}
                      className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded disabled:opacity-50"
                    >
                      {isReconnecting === phoneNumber.id ? (
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                          Moving...
                        </div>
                      ) : (
                        'Move to this Project'
                      )}
                    </button>
                  ) : (
                    // Phone number is available - show connect button
                    <button
                      onClick={() => connectPhoneNumber(phoneNumber)}
                      disabled={isConnecting === phoneNumber.id}
                      className="px-3 py-1 bg-white hover:bg-gray-100 text-black text-sm rounded disabled:opacity-50"
                    >
                      {isConnecting === phoneNumber.id ? (
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 border border-black border-t-transparent rounded-full animate-spin"></div>
                          Connecting...
                        </div>
                      ) : (
                        'Connect to Project'
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
} 