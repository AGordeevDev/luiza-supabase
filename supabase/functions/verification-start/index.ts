// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"
import { parsePhoneNumber, isValidPhoneNumber } from "libphonenumber-js"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface VerificationRequest {
  phone_number: string
}

function validatePhoneNumber(phone: string): { isValid: boolean; error?: string; isTestNumber?: boolean } {
  if (!phone) {
    return { isValid: false, error: 'Phone number is required' }
  }

  // Must start with + for international format
  if (!phone.startsWith('+')) {
    return { isValid: false, error: 'Phone number must include country code (start with +)' }
  }

  // Check if it's a test number pattern (Supabase test numbers are typically +1234567xxx format)
  const isLikelyTestNumber = /^\+1234567\d{3}$/.test(phone) || /^\+[89]{10,11}$/.test(phone)

  try {
    // Use libphonenumber-js for robust validation of real phone numbers
    const phoneNumber = parsePhoneNumber(phone)
    
    if (!phoneNumber) {
      // If it looks like a test number but fails parsing, allow it
      if (isLikelyTestNumber) {
        return { isValid: true, isTestNumber: true }
      }
      return { isValid: false, error: 'Invalid phone number format' }
    }

    // Check if phone number is valid
    if (!phoneNumber.isValid()) {
      // If it looks like a test number but fails validation, allow it (Supabase will handle test numbers)
      if (isLikelyTestNumber) {
        return { isValid: true, isTestNumber: true }
      }
      return { isValid: false, error: 'Invalid phone number for the specified country' }
    }

    // Additional check using the standalone function for real numbers
    if (!isValidPhoneNumber(phone) && !isLikelyTestNumber) {
      return { isValid: false, error: 'Phone number format is not valid' }
    }

    return { isValid: true, isTestNumber: isLikelyTestNumber }
  } catch (error) {
    console.warn('Phone validation error:', error)
    
    // If it looks like a test number, allow it despite parsing errors
    if (isLikelyTestNumber) {
      return { isValid: true, isTestNumber: true }
    }
    
    return { isValid: false, error: 'Invalid phone number format' }
  }
}

/**
 * @openapi
 * /functions/v1/verification-start:
 *   post:
 *     summary: Start phone number verification using Supabase Auth
 *     description: |
 *       Initiates phone number verification by sending an SMS code via Supabase Auth's signInWithOtp.
 *       This uses the configured SMS provider (Twilio, MessageBird, etc.) in your Supabase project.
 *       For testing, use Supabase's test phone numbers like +1234567890 with OTP code 123456.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone_number
 *             properties:
 *               phone_number:
 *                 type: string
 *                 description: Phone number in international format (e.g., +1234567890)
 *                 example: "+1234567890"
 *     responses:
 *       200:
 *         description: Verification code sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Verification code sent successfully"
 *                 phone_number:
 *                   type: string
 *                   example: "+1234567890"
 *       400:
 *         description: Invalid phone number format
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid phone number format. Please use international format (e.g., +1234567890)"
 *       500:
 *         description: Internal server error or SMS service error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to send verification code. Please try again."
 */
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  try {
    const { phone_number }: VerificationRequest = await req.json()

    // Validate phone number format using libphonenumber-js
    const validation = validatePhoneNumber(phone_number)
    if (!validation.isValid) {
      return new Response(
        JSON.stringify({ 
          error: validation.error || 'Invalid phone number format. Please use international format (e.g., +1234567890)' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    try {
      // Use Supabase Auth's signInWithOtp to send verification code
      const { data, error } = await supabaseClient.auth.signInWithOtp({
        phone: phone_number
      })

      if (error) {
        console.error('Supabase Auth error:', error)
        return new Response(
          JSON.stringify({ 
            error: 'Failed to send verification code. Please try again.' 
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      return new Response(
        JSON.stringify({ 
          message: 'Verification code sent successfully',
          phone_number 
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    } catch (error) {
      console.error('Unexpected error during signInWithOtp:', error)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to send verification code. Please try again.' 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/verification-start' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"phone_number":"+1234567890"}'

*/
