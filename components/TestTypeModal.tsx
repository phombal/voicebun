import React, { useState } from 'react';
import { LoadingSpinner } from './LoadingBun';

interface PhoneNumberFeature {
  name: string;
}

interface PhoneNumber {
  id: string;
  phone_number: string;
  features?: PhoneNumberFeature[];
  region_information?: Array<{ region_name?: string }>;
  cost_information?: {
    monthly_cost?: string;
    upfront_cost?: string;
  };
}

interface User {
  id: string;
  [key: string]: any;
}

interface TestTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  availablePhoneNumbers: PhoneNumber[];
  user?: User | null;
  onWebTest: () => void;
  onOutboundTest: (phoneNumberId: string, toNumber: string) => Promise<void>;
}

export function TestTypeModal({
  isOpen,
  onClose,
  availablePhoneNumbers,
  user,
  onWebTest,
  onOutboundTest
}: TestTypeModalProps) {
  const [testType, setTestType] = useState<'web' | 'outbound' | null>(null);
  const [outboundPhoneNumber, setOutboundPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [selectedFromPhoneNumber, setSelectedFromPhoneNumber] = useState('');
  const [isLoadingOutboundTest, setIsLoadingOutboundTest] = useState(false);

  // Format phone number for display
  const formatPhoneNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    
    if (cleaned.length <= 3) {
      return cleaned;
    } else if (cleaned.length <= 6) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    } else if (cleaned.length <= 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    } else {
      return cleaned;
    }
  };

  const handleClose = () => {
    setTestType(null);
    setOutboundPhoneNumber('');
    setCountryCode('+1');
    setSelectedFromPhoneNumber('');
    onClose();
  };

  const handleTestTypeSelection = async (type: 'web' | 'outbound') => {
    setTestType(type);
    
    if (type === 'web') {
      handleClose();
      onWebTest();
    } else if (type === 'outbound') {
      // Set default phone number if available
      if (availablePhoneNumbers.length > 0) {
        setSelectedFromPhoneNumber(availablePhoneNumbers[0].id);
      }
    }
  };

  const handleOutboundTestClick = async () => {
    if (!outboundPhoneNumber.trim()) {
      alert('Please enter a phone number to call');
      return;
    }

    const formattedNumber = `${countryCode}${outboundPhoneNumber.replace(/\D/g, '')}`;
    
    if (!selectedFromPhoneNumber) {
      alert('Please select a phone number to call from');
      return;
    }

    setIsLoadingOutboundTest(true);
    
    try {
      await onOutboundTest(selectedFromPhoneNumber, formattedNumber);
      
      // Find the selected phone number for success message
      const selectedPhoneNumber = availablePhoneNumbers.find(pn => pn.id === selectedFromPhoneNumber);
      alert(`Agent will call you at ${formattedNumber}. Selected from number: ${selectedPhoneNumber?.phone_number}`);
      
      handleClose();
    } catch (error) {
      console.error('❌ Outbound test failed:', error);
      alert(`Failed to initiate outbound call: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoadingOutboundTest(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div className="bg-black border border-white/20 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-white">Choose Test Type</h3>
          <button
            onClick={handleClose}
            className="text-white/70 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {testType === null ? (
          <div className="space-y-4">
            <p className="text-white/70 mb-6">How would you like to test your agent?</p>
            
            <div className="space-y-4">
              {/* Quick Test Option - Call assigned numbers */}
              {availablePhoneNumbers.length > 0 && (
                <div className="w-full p-4 border border-white/20 rounded-lg bg-white/5">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-white">Call Your Agent</h4>
                      <p className="text-sm text-white/70">Call your assigned number directly</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {availablePhoneNumbers.map((phoneNumber) => (
                          <span key={phoneNumber.id} className="text-xs font-mono text-white bg-white/10 px-2 py-1 rounded">
                            {phoneNumber.phone_number}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Outbound Test Option - Only show if phone numbers are available */}
              {availablePhoneNumbers.length > 0 && (
                <button
                  onClick={() => handleTestTypeSelection('outbound')}
                  className="w-full p-4 text-left border border-white/20 rounded-lg hover:border-green-500/50 hover:bg-green-500/10 transition-all duration-200 group"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center group-hover:bg-green-500">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-medium text-white">Have the Agent Call You</h4>
                      <p className="text-sm text-white/70">Test by calling your phone number</p>
                    </div>
                  </div>
                </button>
              )}
              
              {/* Web Test Option */}
              <button
                onClick={() => handleTestTypeSelection('web')}
                className="w-full p-4 text-left border border-white/20 rounded-lg hover:border-blue-500/50 hover:bg-blue-500/10 transition-all duration-200 group"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center group-hover:bg-blue-500">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-medium text-white">Web-based Conversation</h4>
                    <p className="text-sm text-white/70">Test directly in your browser using your microphone</p>
                  </div>
                </div>
              </button>
            </div>
            
            <div className="flex justify-end mt-6">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-white/70 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : testType === 'outbound' ? (
          <div className="space-y-4">
            <p className="text-white/70 mb-6">Configure your outbound test call:</p>
            
            {/* Phone Number Selection Dropdown */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/90">
                Call From
              </label>
              {availablePhoneNumbers.length > 0 ? (
                <select
                  value={selectedFromPhoneNumber}
                  onChange={(e) => setSelectedFromPhoneNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={isLoadingOutboundTest}
                >
                  {availablePhoneNumbers.map((phoneNumber) => (
                    <option key={phoneNumber.id} value={phoneNumber.id} className="bg-black text-white">
                      {phoneNumber.phone_number}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full px-3 py-2 border border-white/20 rounded-lg bg-white/5 text-white/50">
                  No phone numbers available. Please assign a phone number to this project first.
                </div>
              )}
              <p className="text-xs text-white/50">Select which phone number to use for the outbound call</p>
            </div>
            
            {/* Target Phone Number Input */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/90">
                Call To
              </label>
              <div className="flex space-x-2">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={isLoadingOutboundTest}
                >
                  <option value="+1" className="bg-black text-white">🇺🇸 +1</option>
                  <option value="+44" className="bg-black text-white">🇬🇧 +44</option>
                  <option value="+33" className="bg-black text-white">🇫🇷 +33</option>
                  <option value="+49" className="bg-black text-white">🇩🇪 +49</option>
                  <option value="+39" className="bg-black text-white">🇮🇹 +39</option>
                  <option value="+34" className="bg-black text-white">🇪🇸 +34</option>
                  <option value="+31" className="bg-black text-white">🇳🇱 +31</option>
                  <option value="+32" className="bg-black text-white">🇧🇪 +32</option>
                  <option value="+41" className="bg-black text-white">🇨🇭 +41</option>
                  <option value="+43" className="bg-black text-white">🇦🇹 +43</option>
                  <option value="+45" className="bg-black text-white">🇩🇰 +45</option>
                  <option value="+46" className="bg-black text-white">🇸🇪 +46</option>
                  <option value="+47" className="bg-black text-white">🇳🇴 +47</option>
                  <option value="+358" className="bg-black text-white">🇫🇮 +358</option>
                  <option value="+61" className="bg-black text-white">🇦🇺 +61</option>
                  <option value="+64" className="bg-black text-white">🇳🇿 +64</option>
                  <option value="+81" className="bg-black text-white">🇯🇵 +81</option>
                  <option value="+82" className="bg-black text-white">🇰🇷 +82</option>
                  <option value="+86" className="bg-black text-white">🇨🇳 +86</option>
                  <option value="+91" className="bg-black text-white">🇮🇳 +91</option>
                  <option value="+55" className="bg-black text-white">🇧🇷 +55</option>
                  <option value="+52" className="bg-black text-white">🇲🇽 +52</option>
                  <option value="+54" className="bg-black text-white">🇦🇷 +54</option>
                  <option value="+56" className="bg-black text-white">🇨🇱 +56</option>
                  <option value="+57" className="bg-black text-white">🇨🇴 +57</option>
                  <option value="+51" className="bg-black text-white">🇵🇪 +51</option>
                  <option value="+27" className="bg-black text-white">🇿🇦 +27</option>
                </select>
                <input
                  type="tel"
                  value={formatPhoneNumber(outboundPhoneNumber)}
                  onChange={(e) => {
                    const rawDigits = e.target.value.replace(/\D/g, '');
                    setOutboundPhoneNumber(rawDigits);
                  }}
                  placeholder="123-456-7890"
                  className="flex-1 px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={isLoadingOutboundTest}
                />
              </div>
              <p className="text-xs text-white/50">Enter your phone number to receive the test call</p>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setTestType(null);
                  setOutboundPhoneNumber('');
                  setCountryCode('+1');
                  setSelectedFromPhoneNumber('');
                }}
                className="px-4 py-2 text-white/70 hover:text-white transition-colors"
                disabled={isLoadingOutboundTest}
              >
                Back
              </button>
              <button
                onClick={handleOutboundTestClick}
                disabled={isLoadingOutboundTest || !outboundPhoneNumber.trim() || !selectedFromPhoneNumber || availablePhoneNumbers.length === 0}
                className="px-4 py-2 bg-white hover:bg-gray-100 disabled:bg-gray-300 disabled:cursor-not-allowed text-black rounded-lg transition-colors flex items-center space-x-2"
              >
                {isLoadingOutboundTest && (
                  <LoadingSpinner size="md" color="black" />
                )}
                <span>{isLoadingOutboundTest ? 'Calling...' : 'Call Me'}</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
} 