import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsStrongPassword,
} from 'class-validator';

export class SignupDTO {
  @IsEmail({}, { message: 'Please enter a valid email address' })
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @IsStrongPassword(
    {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    },
    {
      message:
        'Password must contain at least one uppercase and lowercase letter, one digit and one symbol',
    },
  )
  password: string;

  @IsNotEmpty()
  @IsString()
  firstName: string;

  @IsNotEmpty()
  @IsString()
  lastName: string;

  @IsString()
  @IsNotEmpty()
  username: string;
}

export class LoginDTO {
  @IsEmail({}, { message: 'Please enter a valid email address' })
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class Verify2faDTO {
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class PasswordResetDTO {
  @IsString()
  @IsNotEmpty()
  email: string;
}

export class VerifyOtpDTO {
  @IsString()
  @IsNotEmpty()
  otp: string;
}

export class NewPasswordDTO {
  @IsString()
  @IsNotEmpty()
  @IsStrongPassword(
    {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    },
    {
      message:
        'Password must contain at least one uppercase and lowercase letter, one digit and one symbol',
    },
  )
  newPassword: string;
}
