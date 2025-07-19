# Authentication API

## Signup

**POST:** `/auth/signup`

### Request Parameters

```json
{
  "email": "hey@example.com",
  "password": "Password12!",
  "confirmPassword": "Password12!",
  "firstName": "Cristiano",
  "lastName": "Ronlado",
  "username": "goat_cr7"
}
```

### Response Body

- **Success**

```json
{
  "user": {
    "email": "hey@example.com",
    "password": "X-X-X",
    "firstName": "Cristiano",
    "lastName": "Ronlado",
    "username": "goat_cr7",
    "createdAt": "date-of-creation",
    "updatedAt": "date-of-update",
    "profileImage": "profile-image-url",
    "twoFASecret": null,
    "twoFAEnabled": false,
    "balance": 0
  },
  "token": "jwt-string"
}
```

- **Input validation errors**

If the value of any input field does not match the required type, a validation error message is returned.

```json
{
  "status": 400,
  "message": ["array of all validation error messages"],
}
```

- **Password inputs mismatch**

```json
{
  "status": 400,
  "message": "Passwords do not match. Try again!",
}
```

- **Duplicate email**

```json
{
  "status": 400,
  "message": "This email already exists. Please try again!",
}
```

## Login

**POST:** `/auth/login`

### Request Parameters

```json
{
  "email": "hey@example.com",
  "password": "Password12!",
}
```

### Response Body

- **Success**

```json
{
  "token": "jwt-string",
  "twoFactorAuth": false,
}
```

- **Input validation errors**

If the value of any input field does not match the required type, a validation error message is returned.

```json
{
  "status": 400,
  "message": ["array of all validation error messages"],
}
```

- **Invalid email**

```json
{
  "status": 400,
  "message": "No user found with that email address",
}
```

- **Invalid password**

```json
{
  "status": 400,
  "message": "Invalid password",
}
```

## Logout

**POST:** `/auth/logout` -- JWT

### Request Parameters

None

### Response Body

- **Success**

```json
{
  "message": "Logout successful!",
}
```

## 2FA

**POST:** `/auth/2fa/enable` -- JWT

### Request Parameters

None

### Response Body

- **Success**

```json
{
  "qrcode": "qrcode-image-url"
}
```

**POST:** `/auth/2fa/verify` -- JWT

### Request Parameters

```json
{
  "token": "2fa-token-from-authenticator-app"
}
```

### Response Body

- **Success**

```json
{
  "message": "2FA token verified successfully"
}
```

- **Invalid token**

```json
{
  "status": 400,
  "message": "Invalid token"
}
```

**POST:** `/auth/2fa/disable` -- JWT

### Request Parameters

None

### Response Body

- **Success**

```json
{
  "message": "2FA disabled successfully"
}
```

## Request Password Reset

**POST:** `/auth/password/reset`

### Request Parameters

```json
{
  "email": "hey@example.com"
}
```

### Response Body

- **Success**

```json
{
  "message": "Password reset OTP has been sent to your email"
}
```

- **Invalid email**

```json
{
  "status": 400,
  "message": "No user found with that email address",
}
```

## Resend Password OTP

**POST:** `/auth/password/resend-otp`

### Request Parameters

None

### Response Body

- **Success**

```json
{
  "message": "'Another OTP has been sent to your email'"
}
```

## Verify Password OTP

**POST:** `/auth/password/verify-otp`

### Request Parameters

```json
{
  "otp": "otp-from-email"
}
```

### Response Body

- **Success**

```json
{
  "message": "OTP verification successful!"
}
```

- **Invalid OTP**

```json
{
  "status": 400,
  "message": "Invalid OTP"
}
```

- **Expired OTP**

```json
{
  "status": 400,
  "message": "This OTP has expired"
}
```

## Complete Password Reset

**POST:** `/auth/password/new`

### Request Parameters

```json
{
  "newPassword": "new-Password12!"
}
```

### Response Body

- **Success**

```json
{
  "message": "Password reset complete!"
}
```

- **Input validation errors**

If the password is not strong enough, a validation error message is returned.

```json
{
  "status": 400,
  "message": ["array of all validation error messages"],
}
```