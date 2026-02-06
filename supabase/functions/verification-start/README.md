# Verification Start API

This Supabase Edge Function initiates phone number verification by sending an SMS code via Twilio.

## Endpoint

### POST /functions/v1/verification-start

Initiates phone number verification by sending an SMS code.

**Request Body:**
```json
{
  "phone_number": "+1234567890"
}
```

**Response:**
```json
{
  "message": "Verification code sent successfully",
  "phone_number": "+1234567890"
}
```

## Test Mode

For testing purposes, you can use the test phone number `+1234567890`. In test mode:

- No actual SMS is sent
- The response includes `test_mode: true` and `test_code: "123456"`
- You can also enable test mode by setting `TWILIO_TEST_MODE=true` environment variable

**Test Mode Response:**
```json
{
  "message": "Verification code sent successfully (TEST MODE)",
  "phone_number": "+1234567890",
  "test_mode": true,
  "test_code": "123456"
}
```

## Environment Variables

The following environment variables must be set:

- `TWILIO_ACCOUNT_SID`: Your Twilio Account SID
- `TWILIO_AUTH_TOKEN`: Your Twilio Auth Token
- `TWILIO_VERIFY_SERVICE_SID`: Your Twilio Verify Service SID
- `TWILIO_TEST_MODE`: Set to "true" to enable test mode (optional)

## Phone Number Format

Phone numbers must be in international format (e.g., `+1234567890`).

## Error Responses

- `400`: Invalid phone number format
- `500`: Twilio service error or internal server error

## API Documentation

This function includes OpenAPI documentation that can be used to generate Postman collections during CI/CD. 