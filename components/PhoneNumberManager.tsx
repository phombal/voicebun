import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PhoneNumber } from '@/lib/database/types';
import { clientDb } from '@/lib/database/client-service';
import { LoadingBun, LoadingSpinner } from './LoadingBun';

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
  
  // Outbound calling state
  const [outboundNumber, setOutboundNumber] = useState('');
  const [isMakingCall, setIsMakingCall] = useState<string | null>(null);
  
  const { user } = useAuth();

  // Add error handler for uncaught errors
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('🚨 Uncaught error in PhoneNumberManager:', event.error);
    };
    
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('🚨 Unhandled promise rejection in PhoneNumberManager:', event.reason);
    };
    
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Load user's phone numbers
  const loadPhoneNumbers = async () => {
    setIsLoading(true);
    try {
      if (!user) {
        setPhoneNumbers([]);
        return;
      }
      
      const numbers = await clientDb.getUserPhoneNumbers();
      setPhoneNumbers(numbers);
    } catch (error) {
      console.error('❌ Error loading phone numbers:', error);
      setPhoneNumbers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPhoneNumbers();
  }, [user]);

  // Connect phone number to project using the assign endpoint
  const connectPhoneNumber = async (phoneNumber: PhoneNumber) => {
    console.log('🔗 connectPhoneNumber function called with:', {
      phoneNumber: phoneNumber,
      projectId: projectId,
      user: user ? { id: user.id, email: user.email } : 'No user'
    });

    if (!projectId || !user) {
      console.error('❌ Missing projectId or user for connection');
      console.error('   ProjectId:', projectId);
      console.error('   User:', user ? 'Present' : 'Missing');
      
      // Show error notification to user
      const notification = document.createElement('div');
      notification.innerHTML = `
        <div class="flex items-center space-x-3">
          <div class="w-6 h-6 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </div>
          <div>
            <div class="font-medium">Cannot Connect Phone Number</div>
            <div class="text-sm opacity-90">${!projectId ? 'No project ID available' : 'User not logged in'}</div>
          </div>
        </div>
      `;
      notification.className = 'fixed bottom-4 right-4 bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-sm';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 6000);
      return;
    }

    console.log('✅ All requirements met, proceeding with connection...');
    setIsConnecting(phoneNumber.id);

    try {
      console.log('🔗 Connecting phone number to project:', {
        phoneNumberId: phoneNumber.id,
        projectId,
        phoneNumber: phoneNumber.phone_number,
        userId: user.id
      });

      const requestBody = {
        phoneNumberId: phoneNumber.id,
        projectId: projectId,
        userId: user.id,
        sipHost: '6ckp7xx52cn.sip.livekit.cloud'
      };

      console.log('📤 Making API request to /api/assign-phone-number with body:', requestBody);

      const response = await fetch('/api/assign-phone-number', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('📥 API response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ API request failed:', errorData);
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
        console.log('📞 Notifying parent component of phone number assignment');
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
      notification.className = 'fixed bottom-4 right-4 bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-sm';
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
      notification.className = 'fixed bottom-4 right-4 bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-sm';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 6000);
    } finally {
      console.log('🏁 Setting isConnecting to null (cleanup)');
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
      notification.className = 'fixed bottom-4 right-4 bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-sm';
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
      notification.className = 'fixed bottom-4 right-4 bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-sm';
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
      notification.className = 'fixed bottom-4 right-4 bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-sm';
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
      notification.className = 'fixed bottom-4 right-4 bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-sm';
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

  // Make outbound call
  const makeOutboundCall = async (phoneNumber: PhoneNumber, targetNumber: string) => {
    if (!projectId || !user) {
      console.error('❌ Missing projectId or user for outbound call');
      return;
    }

    setIsMakingCall(phoneNumber.id);

    try {
      console.log('📞 Making outbound call:', {
        fromPhoneNumberId: phoneNumber.id,
        fromNumber: phoneNumber.phone_number,
        toNumber: targetNumber,
        projectId
      });

      const response = await fetch('/api/make-outbound-call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumberId: phoneNumber.id,
          toNumber: targetNumber,
          projectId: projectId,
          userId: user.id
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || 'Outbound call failed');
      }

      const result = await response.json();
      console.log('✅ Outbound call initiated successfully:', result);

      // Show success notification
      const notification = document.createElement('div');
      notification.innerHTML = `
        <div class="flex items-center space-x-3">
          <div class="w-6 h-6 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path>
            </svg>
          </div>
          <div>
            <div class="font-medium">Outbound Call Initiated!</div>
            <div class="text-sm opacity-90">Calling ${targetNumber} from ${phoneNumber.phone_number}</div>
          </div>
        </div>
      `;
      notification.className = 'fixed bottom-4 right-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-sm';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 6000);

      // Clear the input
      setOutboundNumber('');

    } catch (error) {
      console.error('❌ Error making outbound call:', error);
      
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
            <div class="font-medium">Outbound Call Failed</div>
            <div class="text-sm opacity-90">${error instanceof Error ? error.message : 'Unknown error occurred'}</div>
          </div>
        </div>
      `;
      notification.className = 'fixed bottom-4 right-4 bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-sm';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 6000);
    } finally {
      setIsMakingCall(null);
    }
  };

  if (isLoading) {
    return <LoadingBun message="Loading phone numbers..." />;
  }

  if (phoneNumbers.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </div>
        <p className="text-white/70 text-lg font-medium mb-2">No phone numbers purchased yet</p>
        <p className="text-white/50 text-sm mb-6">Purchase a phone number to enable inbound calling for your voice agent</p>
        {onPurchaseNumber && (
          <button
            onClick={onPurchaseNumber}
            className="px-6 py-3 bg-white hover:bg-gray-100 text-black font-medium rounded-lg transition-colors flex items-center space-x-2 mx-auto"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Get New Number</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Get New Number Button */}
      <div className="flex justify-end">
        {onPurchaseNumber && (
          <button
            onClick={() => {
              onPurchaseNumber();
            }}
            className="px-4 py-2 bg-white hover:bg-gray-100 text-black font-medium rounded-lg transition-colors duration-200 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Get New Number
          </button>
        )}
      </div>

      {/* Phone Numbers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {phoneNumbers.map((phoneNumber) => {
          const isConnectedToCurrentProject = phoneNumber.project_id === projectId;
          const isConnectedToOtherProject = phoneNumber.project_id && phoneNumber.project_id !== projectId;
          
          return (
            <div
              key={phoneNumber.id}
              className={`bg-white/5 rounded-xl p-6 border transition-all duration-200 hover:scale-105 hover:shadow-lg ${
                isConnectedToCurrentProject
                  ? 'border-blue-500/50 bg-blue-500/10'
                  : isConnectedToOtherProject
                  ? 'border-yellow-500/50 bg-yellow-500/10'
                  : 'border-white/10 hover:border-white/20'
              }`}
            >
              {/* Card Header */}
              <div className="flex items-center justify-center mb-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                  isConnectedToCurrentProject
                    ? 'bg-blue-600'
                    : isConnectedToOtherProject
                    ? 'bg-yellow-600'
                    : 'bg-green-600'
                }`}>
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
              </div>

              {/* Phone Number */}
              <div className="text-center mb-4">
                <h3 className="text-white font-semibold text-lg mb-2">
                  {formatPhoneNumber(phoneNumber.phone_number)}
                </h3>
                
                {/* Status Badge */}
                <div className="flex justify-center">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    isConnectedToCurrentProject
                      ? 'bg-blue-600 text-blue-100'
                      : isConnectedToOtherProject
                      ? 'bg-yellow-600 text-yellow-100'
                      : 'bg-green-600 text-green-100'
                  }`}>
                    {isConnectedToCurrentProject 
                      ? 'Connected to this project' 
                      : isConnectedToOtherProject 
                      ? 'Connected to other project'
                      : 'Available'}
                  </span>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex justify-center">
                {phoneNumber.project_id === projectId ? (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      try {
                        disconnectPhoneNumber(phoneNumber);
                      } catch (error) {
                        console.error('❌ Error in disconnect handler:', error);
                      }
                    }}
                    disabled={isDisconnecting === phoneNumber.id}
                    className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-500 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
                  >
                    {isDisconnecting === phoneNumber.id ? (
                      <>
                        <LoadingSpinner size="sm" color="white" />
                        <span>Disconnecting...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span>Disconnect</span>
                      </>
                    )}
                  </button>
                ) : phoneNumber.project_id ? (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      try {
                        reconnectPhoneNumber(phoneNumber);
                      } catch (error) {
                        console.error('❌ Error in reconnect handler:', error);
                      }
                    }}
                    disabled={isReconnecting === phoneNumber.id}
                    className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-500 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
                  >
                    {isReconnecting === phoneNumber.id ? (
                      <>
                        <LoadingSpinner size="sm" color="white" />
                        <span>Moving...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                        <span>Move to Project</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      try {
                        connectPhoneNumber(phoneNumber);
                      } catch (error) {
                        console.error('❌ Error in connect handler:', error);
                      }
                    }}
                    disabled={isConnecting === phoneNumber.id}
                    className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-500 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
                  >
                    {isConnecting === phoneNumber.id ? (
                      <>
                        <LoadingSpinner size="sm" color="white" />
                        <span>Connecting...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        <span>Connect</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
} 