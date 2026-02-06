# Verification Verify API

This Supabase Edge Function verifies the SMS code and creates/authenticates users in Supabase Auth.

## Endpoint

### POST /functions/v1/verification-verify

Verifies the SMS code and creates/authenticates the user.

**Request Body:**
```json
{
  "phone_number": "+1234567890",
  "verification_code": "123456"
}
```

**Note:** The verification code must be exactly 6 digits.

**Response:**
```json
{
  "message": "Phone verification successful",
  "user_id": "uuid",
  "access_token": "base64-encoded-token",
  "phone_number": "+1234567890"
}
```

## Test Mode

For testing purposes, you can use the test phone number `+1234567890` with verification code `123456`. In test mode:

- No actual Twilio verification is performed
- The code `123456` is always accepted for the test phone number
- The response includes `test_mode: true`
- You can also enable test mode by setting `TWILIO_TEST_MODE=true` environment variable

**Test Mode Response:**
```json
{
  "message": "Phone verification successful",
  "user_id": "uuid",
  "access_token": "base64-encoded-token",
  "phone_number": "+1234567890",
  "test_mode": true
}
```

## Environment Variables

The following environment variables must be set:

- `TWILIO_ACCOUNT_SID`: Your Twilio Account SID
- `TWILIO_AUTH_TOKEN`: Your Twilio Auth Token
- `TWILIO_VERIFY_SERVICE_SID`: Your Twilio Verify Service SID
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key
- `TWILIO_TEST_MODE`: Set to "true" to enable test mode (optional)

## Phone Number Format

Phone numbers must be in international format (e.g., `+1234567890`).

## User Management

- If a user with the phone number doesn't exist, a new user is created in Supabase Auth
- If a user already exists, the existing user is returned
- The access token can be used for subsequent API calls to identify the user

## Usage in Other Endpoints

To use the access token in other endpoints, include it in the Authorization header:

```
Authorization: Bearer <access_token>
```

The token contains the user_id and phone_number for user identification.

## Error Responses

- `400`: Invalid phone number format or verification code
- `500`: Twilio service error, Supabase error, or internal server error

## API Documentation

This function includes OpenAPI documentation that can be used to generate Postman collections during CI/CD. 