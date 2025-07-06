import { Chain, TransactionStatus, TransactionType } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateProfileDTO {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsEmail()
  @IsOptional()
  username?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  profileImage?: string;

  @IsOptional()
  @IsString()
  twoFASecret?: string;

  @IsOptional()
  @IsBoolean()
  twoFAEnabled?: boolean;
}

export class GetTransactionsDTO {
  @IsEnum(TransactionStatus, {
    message: 'Invalid "status" value. Expected "SUCCESS" or "FAILED"',
  })
  @IsOptional()
  status?: TransactionStatus;

  @IsEnum(TransactionType, {
    message: 'Invalid "type" value. Expected "DEPOSIT" or "WITHDRAWAL"',
  })
  @IsOptional()
  type?: TransactionType;

  @IsEnum(Chain, {
    message: 'Invalid "chain" value. Expected "BASE" or "SOLANA"',
  })
  @IsOptional()
  chain?: Chain;
}

export class FundsTransferDTO {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsNumber()
  @IsNotEmpty()
  amount: number;
}
