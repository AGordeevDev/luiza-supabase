// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"
import type { Profile } from "../_shared/types.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface VerificationConfirmRequest {
  phone_number: string
  verification_code: string
}

// Phone number validation regex (basic international format)
const PHONE_REGEX = /^\+[1-9]\d{1,14}$/

function validatePhoneNumber(phone: string): boolean {
  return PHONE_REGEX.test(phone)
}

/**
 * @openapi
 * /functions/v1/verification-verify:
 *   post:
 *     summary: Verify phone number using Supabase Auth
 *     description: |
 *       Verifies a phone number using the OTP code sent via SMS, creates a session,
 *       and returns the authenticated user's profile.
 *       For testing, use Supabase's test phone numbers like +1234567890 with OTP code 123456.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone_number
 *               - verification_code
 *             properties:
 *               phone_number:
 *                 type: string
 *                 description: Phone number in international format (e.g., +1234567890)
 *                 example: "+1234567890"
 *               verification_code:
 *                 type: string
 *                 description: 6-digit verification code sent via SMS
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Phone verification successful; returns session, user, and business profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Phone verification successful"
 *                 session:
 *                   type: object
 *                   properties:
 *                     access_token:
 *                       type: string
 *                       description: JWT access token for authenticated requests
 *                     refresh_token:
 *                       type: string
 *                       description: Refresh token for getting new access tokens
 *                     expires_in:
 *                       type: number
 *                       description: Token expiration time in seconds
 *                     token_type:
 *                       type: string
 *                       example: "bearer"
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: User's unique identifier
 *                     phone:
 *                       type: string
 *                       description: User's phone number
 *                     profile:
 *                       type: object
 *                       description: User profile (nullable fields if not set)
 *                       properties:
 *                         email:
 *                           type: string
 *                           nullable: true
 *                         first_name:
 *                           type: string
 *                           nullable: true
 *                         last_name:
 *                           type: string
 *                           nullable: true
 *                         phone:
 *                           type: string
 *                           nullable: true
 *                         correspondence_address:
 *                           type: string
 *                           nullable: true
 *       400:
 *         description: Invalid phone number format or verification code
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid verification code"
 *       500:
 *         description: Internal server error or Supabase Auth error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Verification failed. Please try again."
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
    const { phone_number, verification_code }: VerificationConfirmRequest = await req.json()

    // Validate phone number format
    if (!validatePhoneNumber(phone_number)) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid phone number format' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!verification_code || verification_code.length !== 6) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid verification code. Code must be 6 digits.' 
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
      // Use Supabase Auth's verifyOtp to verify the code and get a session
      const { data, error } = await supabaseClient.auth.verifyOtp({
        phone: phone_number,
        token: verification_code,
        type: 'sms'
      })

      if (error) {
        console.error('Supabase Auth verification error:', error)
        return new Response(
          JSON.stringify({ 
            error: 'Invalid verification code' 
          }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      if (!data.session) {
        return new Response(
          JSON.stringify({ 
            error: 'Verification failed. No session created.' 
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      if (!data.user) {
        return new Response(
          JSON.stringify({ 
            error: 'Verification failed. No user data available.' 
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      // Create an authenticated client using the newly created session to respect RLS/roles
      const authedClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        {
          global: {
            headers: {
              Authorization: `Bearer ${data.session.access_token}`,
            },
          },
          auth: {
            persistSession: false,
            detectSessionInUrl: false,
          },
        }
      )

      // Fetch user profile (nullable if missing)
      const { data: userProfile, error: userProfileError } = await authedClient
        .from('profiles')
        .select('email, first_name, last_name, phone, correspondence_address')
        .eq('id', data.user.id)
        .maybeSingle<Profile>()

      if (userProfileError) {
        console.warn('Error fetching profiles:', userProfileError)
      }

      return new Response(
        JSON.stringify({
          message: 'Phone verification successful',
          session: data.session,
          user: {
            id: data.user.id,
            phone: data.user.phone,
            profile: {
              email: userProfile?.email ?? null,
              first_name: userProfile?.first_name ?? null,
              last_name: userProfile?.last_name ?? null,
              phone: userProfile?.phone ?? null,
              correspondence_address: userProfile?.correspondence_address ?? null,
            },
          },
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      ) 

    } catch (error) {
      console.error('Unexpected error during verifyOtp:', error)
      return new Response(
        JSON.stringify({ 
          error: 'Verification failed. Please try again.' 
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

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/verification-verify' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"phone_number":"+1234567890","verification_code":"123456"}'

*/
