import React, { useCallback, useEffect } from 'react';
import { PhoneNumberManager } from './PhoneNumberManager';

interface PhoneNumbersTabProps {
  project?: any;
  currentProject?: any;
  user?: any;
  getProjectPhoneNumbers: (projectId: string) => Promise<any[]>;
  onTestAgentClick: () => void;
  onOutboundTestAPI: (phoneNumberId: string, toNumber: string) => Promise<void>;
  setAssignedPhoneNumber?: (number: string) => void;
  setAssignedPhoneNumberId?: (id: string) => void;
  setAvailableNumbers: (numbers: any[]) => void;
  createProject?: (title: string, description: string, prompt: string, config: any, code: string) => Promise<any>;
  config: any;
  code: string;
  onPurchaseNumber: () => void;
}

export function PhoneNumbersTab({
  project,
  currentProject,
  getProjectPhoneNumbers,
  setAssignedPhoneNumber,
  setAssignedPhoneNumberId,
  onPurchaseNumber
}: PhoneNumbersTabProps) {
  
  // Load assigned phone number for the project
  const loadAssignedPhoneNumber = useCallback(async () => {
    const projectToUse = project || currentProject;
    if (!projectToUse) return;
    
    try {
      const phoneNumbers = await getProjectPhoneNumbers(projectToUse.id);
      console.log('📱 Project phone numbers loaded:', phoneNumbers);
      console.log('📱 Number of phone numbers found:', phoneNumbers.length);
      
      if (phoneNumbers.length > 0) {
        // Debug: Log all phone numbers with their status
        phoneNumbers.forEach((pn: any, index: number) => {
          console.log(`📱 Phone #${index + 1}:`, {
            id: pn.id,
            number: pn.phone_number,
            status: pn.status,
            is_active: pn.is_active,
            dispatch_rule_id: pn.dispatch_rule_id
          });
        });
        
        // Try to find an active phone number with more flexible criteria
        let activePhoneNumber = phoneNumbers.find((pn: any) => pn.is_active && pn.status === 'active');
        
        // If no "active" status found, try other common status values
        if (!activePhoneNumber) {
          console.log('📱 No phone number with status="active" found, trying other statuses...');
          activePhoneNumber = phoneNumbers.find((pn: any) => pn.is_active && pn.status === 'assigned');
        }
        
        // If still not found, try any active phone number
        if (!activePhoneNumber) {
          console.log('📱 No phone number with status="assigned" found, trying any active...');
          activePhoneNumber = phoneNumbers.find((pn: any) => pn.is_active);
        }
        
        // If still not found, just take the first one
        if (!activePhoneNumber && phoneNumbers.length > 0) {
          console.log('📱 No active phone number found, taking the first one...');
          activePhoneNumber = phoneNumbers[0];
        }
        
        if (activePhoneNumber) {
          setAssignedPhoneNumber?.(activePhoneNumber.phone_number);
          setAssignedPhoneNumberId?.(activePhoneNumber.id);
          console.log('📱 Loaded assigned phone number:', {
            number: activePhoneNumber.phone_number,
            id: activePhoneNumber.id,
            status: activePhoneNumber.status,
            is_active: activePhoneNumber.is_active
          });
        } else {
          console.log('📱 No suitable phone number found');
        }
      } else {
        console.log('📱 No phone numbers found for this project');
      }
    } catch (error) {
      console.error('❌ Error loading assigned phone number:', error);
    }
  }, [project, currentProject, getProjectPhoneNumbers, setAssignedPhoneNumber, setAssignedPhoneNumberId]);

  const handlePhoneNumberAssigned = (phoneNumber: string, phoneNumberId: string) => {
    setAssignedPhoneNumber?.(phoneNumber);
    setAssignedPhoneNumberId?.(phoneNumberId);
  };

  // Load phone numbers when component mounts or project changes
  useEffect(() => {
    loadAssignedPhoneNumber();
  }, [loadAssignedPhoneNumber]);

  const projectToUse = project || currentProject;

  return (
    <div className="h-full bg-black overflow-y-auto">
      {/* Combined Phone Numbers Configuration Section */}
      <div className="bg-white/10 backdrop-blur-sm h-full p-8 w-full">
        <h3 className="text-xl font-semibold text-white mb-6 flex items-center">
          <svg className="w-6 h-6 mr-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          Phone Numbers
        </h3>
        
        <div className="space-y-6">
          <p className="text-white/70">
            Manage phone numbers for your voice agent. Connect numbers to enable inbound calling.
          </p>
          
          <PhoneNumberManager 
            projectId={projectToUse?.id}
            onPhoneNumberAssigned={handlePhoneNumberAssigned}
            onPurchaseNumber={onPurchaseNumber}
          />
        </div>
      </div>
    </div>
  );
} 