import { NextRequest, NextResponse } from 'next/server';
import { CartesiaClient } from "@cartesia/cartesia-js";

// Helper function to estimate audio duration from WebM/audio data
function estimateAudioDuration(audioBuffer: ArrayBuffer, sampleRate: number = 48000): number {
  // This is a rough estimation - actual duration would require proper audio parsing
  // For WebM, we can estimate based on file size and typical bitrates
  const fileSizeKB = audioBuffer.byteLength / 1024;
  const estimatedBitrate = 128; // kbps - typical for voice recordings
  const estimatedDurationSeconds = (fileSizeKB * 8) / estimatedBitrate;
  return estimatedDurationSeconds;
}

export async function POST(request: NextRequest) {
  try {
    console.log('=== Clone Voice API Request Started ===');
    
    const formData = await request.formData();
    console.log('FormData received, keys:', Array.from(formData.keys()));
    
    const audioFile = formData.get('audioFile') as File;
    const voiceName = formData.get('voiceName') as string;
    const userEmail = formData.get('userEmail') as string;
    const userName = formData.get('userName') as string;
    const projectId = formData.get('projectId') as string;

    console.log('Extracted form data:');
    console.log('- audioFile:', audioFile ? `${audioFile.name} (${audioFile.size} bytes, ${audioFile.type})` : 'null');
    console.log('- voiceName:', voiceName);
    console.log('- userEmail:', userEmail);
    console.log('- userName:', userName);
    console.log('- projectId:', projectId);

    if (!audioFile || !voiceName || !userEmail || !userName || !projectId) {
      console.log('Missing required fields validation failed');
      return NextResponse.json(
        { error: 'Missing required fields: audioFile, voiceName, userEmail, userName, projectId' },
        { status: 400 }
      );
    }

    // Process the audio file
    const audioBuffer = await audioFile.arrayBuffer();
    const estimatedDuration = estimateAudioDuration(audioBuffer);
    console.log('Estimated audio duration:', estimatedDuration.toFixed(2), 'seconds');
    
    // Check if audio is too short before processing
    if (estimatedDuration < 5) {
      console.error('Audio too short for voice cloning');
      return NextResponse.json(
        { 
          error: 'Audio recording too short', 
          details: `Voice cloning requires at least 5 seconds of audio. Your recording is only ${estimatedDuration.toFixed(1)} seconds. Please record a longer sample.`,
          estimatedDuration: estimatedDuration
        },
        { status: 400 }
      );
    }

    console.log('Audio Analysis:');
    console.log('- File size:', audioFile.size, 'bytes');
    console.log('- Estimated duration:', estimatedDuration.toFixed(2), 'seconds');
    console.log('- File type:', audioFile.type);

    // Check if duration seems reasonable
    if (estimatedDuration < 5) {
      console.warn('WARNING: Audio duration seems too short for voice cloning (< 5 seconds)');
    } else if (estimatedDuration > 120) {
      console.warn('WARNING: Audio duration seems too long for voice cloning (> 2 minutes)');
    } else {
      console.log('Audio duration appears to be in acceptable range for voice cloning');
    }

    // Create voice clone using Cartesia API
    console.log('Creating voice clone with Cartesia API...');
    
    try {
      const client = new CartesiaClient({ apiKey: "sk_car_7C6h4vkD9BsW7ehG8TPaz8" });
      
      console.log('Sending to Cartesia API:', {
        voiceName,
        audioFile: {
          name: audioFile.name,
          size: audioFile.size,
          type: audioFile.type
        }
      });
      
      const result = await client.voices.clone(audioFile, {
        name: voiceName,
        description: `Voice clone created for ${userName}`,
        mode: "similarity",
        language: "en"
      });

      console.log('Cartesia API success response:', result);

      // Save the custom voice to the database
      console.log('Saving custom voice to database...');
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // First, get the user ID from the email
        const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
        
        if (userError) {
          console.error('Error fetching users:', userError);
          // Continue anyway - voice was created successfully
        } else {
          // Find the user with matching email
          const user = userData.users.find(u => u.email === userEmail);
          
          if (!user) {
            console.error('User not found with email:', userEmail);
            // Continue anyway - voice was created successfully
          } else {
            const userId = user.id;
            console.log('Found user ID:', userId);

            // Get the user's plan record to update custom voices
            const { data: userPlan, error: fetchError } = await supabase
              .from('user_plans')
              .select('id, user_id, custom_voices')
              .eq('user_id', userId)
              .single();

            if (fetchError) {
              console.error('Error fetching user plan:', fetchError);
              // Continue anyway - voice was created successfully
            } else if (userPlan) {
              console.log(`Found user plan for user: ${userId}`);
              console.log('Current user plan details:', {
                id: userPlan.id,
                user_id: userPlan.user_id,
                current_custom_voices: userPlan.custom_voices?.length || 0
              });
              
              // Add the new voice to the custom_voices array
              const currentVoices = userPlan?.custom_voices || [];
              const newVoice = {
                id: result.id,
                displayName: voiceName,
                createdAt: new Date().toISOString()
              };
              
              const updatedVoices = [...currentVoices, newVoice];
              console.log('Updated voices array:', updatedVoices);

              // Update the user_plans table with the new custom voice
              const { data: updatedUserPlan, error: updateError } = await supabase
                .from('user_plans')
                .update({
                  custom_voices: updatedVoices,
                  updated_at: new Date().toISOString()
                })
                .eq('user_id', userId)
                .select('id, user_id, custom_voices')
                .single();

              if (updateError) {
                console.error('Error updating user plan with custom voice:', updateError);
                console.error('Update error details:', JSON.stringify(updateError, null, 2));
                // Continue anyway - voice was created successfully
              } else {
                console.log('Successfully updated user plan with new custom voice:', {
                  id: updatedUserPlan.id,
                  user_id: updatedUserPlan.user_id,
                  custom_voices_count: updatedUserPlan.custom_voices?.length || 0
                });
                console.log('Custom voice saved to database successfully');
              }
            } else {
              console.log('User plan not found for user:', userId);
            }
          }
        }
      } catch (dbError) {
        console.error('Database operation failed:', dbError);
        // Continue anyway - voice was created successfully
      }
      
      return NextResponse.json({
        success: true,
        voiceId: result.id,
        voiceName: voiceName,
        displayName: voiceName,
        message: 'Voice clone created successfully'
      });

    } catch (error) {
      console.error('Cartesia API error:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      
      return NextResponse.json(
        { 
          error: 'Cartesia API error', 
          details: error instanceof Error ? error.message : 'Unknown error',
          type: error instanceof Error ? error.constructor.name : typeof error
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Clone voice API error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error',
        type: error instanceof Error ? error.constructor.name : typeof error
      },
      { status: 500 }
    );
  }
} 