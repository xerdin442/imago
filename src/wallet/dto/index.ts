import { Chain } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class DepositDTO {
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsString()
  @IsNotEmpty()
  depositor: string;

  @IsEnum(Chain, {
    message: 'Invalid chain parameter. Expected "BASE" or "SOLANA"',
  })
  @IsNotEmpty()
  chain: Chain;

  @IsString()
  @IsNotEmpty()
  txIdentifier: string;
}

export class WithdrawalDTO {
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsEnum(Chain, {
    message: 'Invalid chain parameter. Expected "BASE" or "SOLANA"',
  })
  @IsNotEmpty()
  chain: Chain;
}
