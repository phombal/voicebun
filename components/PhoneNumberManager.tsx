import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PhoneNumber } from '@/lib/database/types';
import { db } from '@/lib/database/service';

interface PhoneNumberManagerProps {
  projectId?: string;
  onPhoneNumberAssigned?: (phoneNumber: string, phoneNumberId: string) => void;
  onPurchaseNumber?: () => void;
}

export function PhoneNumberManager({ projectId, onPhoneNumberAssigned, onPurchaseNumber }: PhoneNumberManagerProps) {
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAssigning, setIsAssigning] = useState<string | null>(null);
  const [isUnassigning, setIsUnassigning] = useState<string | null>(null);
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

  // Assign phone number to project using the assign endpoint
  const assignPhoneNumber = async (phoneNumber: PhoneNumber) => {
    if (!projectId || !user) {
      console.error('❌ Missing projectId or user for assignment');
      return;
    }

    setIsAssigning(phoneNumber.id);

    try {
      console.log('🔗 Assigning phone number to project:', {
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
        throw new Error(errorData.details || errorData.error || 'Assignment failed');
      }

      const result = await response.json();
      console.log('✅ Phone number assigned successfully:', result);

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
            <div class="font-medium">Phone Number Assigned!</div>
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
      console.error('❌ Error assigning phone number:', error);
      
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
            <div class="font-medium">Assignment Failed</div>
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
      setIsAssigning(null);
    }
  };

  // Unassign phone number from project
  const unassignPhoneNumber = async (phoneNumber: PhoneNumber) => {
    if (!user) {
      console.error('❌ Missing user for unassignment');
      return;
    }

    // Use the phone number's actual project_id from the database, not the current page's projectId
    const actualProjectId = phoneNumber.project_id;
    if (!actualProjectId) {
      console.error('❌ Phone number has no project_id to unassign from');
      return;
    }

    setIsUnassigning(phoneNumber.id);

    try {
      console.log('📞 Unassigning phone number from project:', {
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
        throw new Error(errorData.details || errorData.error || 'Unassignment failed');
      }

      const result = await response.json();
      console.log('✅ Phone number unassigned successfully:', result);

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
            <div class="font-medium">Phone number unassigned successfully!</div>
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
      console.error('❌ Error unassigning phone number:', error);
      
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
            <div class="font-medium">Unassignment Failed</div>
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
      setIsUnassigning(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-300">Loading phone numbers...</span>
      </div>
    );
  }

  if (phoneNumbers.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </div>
        <p className="text-gray-400">No phone numbers purchased yet</p>
        <p className="text-gray-500 text-sm mt-1">Purchase a phone number first to assign it to your project</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-white">Your Phone Numbers</h3>
        <div className="flex items-center space-x-3">
          <button
            onClick={loadPhoneNumbers}
            className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-lg transition-colors flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Refresh</span>
          </button>
          {onPurchaseNumber && (
            <button
              onClick={onPurchaseNumber}
              className="px-4 py-2 bg-white hover:bg-gray-100 text-black font-medium rounded-lg transition-colors flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Purchase Number</span>
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {phoneNumbers.map((phoneNumber) => {
          const isAssignedToCurrentProject = phoneNumber.project_id === projectId;
          const isAssignedToOtherProject = phoneNumber.project_id && phoneNumber.project_id !== projectId;
          
          return (
            <div
              key={phoneNumber.id}
              className="bg-gray-700 rounded-lg p-4 flex items-center justify-between"
            >
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                
                <div>
                  <p className="text-white font-medium">{phoneNumber.phone_number}</p>
                  <div className="flex items-center space-x-3 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      isAssignedToCurrentProject
                        ? 'bg-blue-600 text-blue-100'
                        : isAssignedToOtherProject
                        ? 'bg-yellow-600 text-yellow-100'
                        : 'bg-green-600 text-green-100'
                    }`}>
                      {isAssignedToCurrentProject 
                        ? 'assigned' 
                        : isAssignedToOtherProject 
                        ? 'assigned to other project'
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
                        onClick={() => unassignPhoneNumber(phoneNumber)}
                        disabled={isUnassigning === phoneNumber.id}
                        className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-sm rounded disabled:opacity-50"
                      >
                        {isUnassigning === phoneNumber.id ? (
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                            Unassigning...
                          </div>
                        ) : (
                          'Unassign'
                        )}
                      </button>
                      <span className="text-green-400 text-sm font-medium flex items-center">
                        Assigned
                      </span>
                    </>
                  ) : phoneNumber.project_id ? (
                    // Phone number is assigned to another project - only show unassign button
                    <button
                      onClick={() => unassignPhoneNumber(phoneNumber)}
                      disabled={isUnassigning === phoneNumber.id}
                      className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-sm rounded disabled:opacity-50"
                    >
                      {isUnassigning === phoneNumber.id ? (
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                          Unassigning...
                        </div>
                      ) : (
                        'Unassign'
                      )}
                    </button>
                  ) : (
                    // Phone number is available - show assign button
                    <button
                      onClick={() => assignPhoneNumber(phoneNumber)}
                      disabled={isAssigning === phoneNumber.id}
                      className="px-3 py-1 bg-white hover:bg-gray-100 text-black text-sm rounded disabled:opacity-50"
                    >
                      {isAssigning === phoneNumber.id ? (
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 border border-black border-t-transparent rounded-full animate-spin"></div>
                          Assigning...
                        </div>
                      ) : (
                        'Assign to Project'
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