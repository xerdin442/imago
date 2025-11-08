import { WagerCategory } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateWagerDTO {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  conditions: string;

  @IsEnum(WagerCategory, { message: 'Invalid wager category value' })
  @IsNotEmpty()
  category: WagerCategory;

  @IsNumber()
  @IsNotEmpty()
  stake: number;
}

export class UpdateWagerDTO {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  conditions?: string;

  @IsNumber()
  @IsOptional()
  stake?: number;
}

export class WagerInviteDTO {
  @IsString()
  @IsNotEmpty()
  inviteCode: string;
}

export class DisputeResolutionDTO {
  @IsString()
  @IsNotEmpty()
  username: string;
}
