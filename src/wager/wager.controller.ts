import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Message, User, Wager } from '@prisma/client';
import { GetUser } from '../custom/decorators';
import {
  CreateWagerDTO,
  DisputeResolutionDTO,
  UpdateWagerDTO,
  WagerInviteDTO,
} from './dto';
import { AdminGuard } from '../custom/guards/admin.guard';
import { WagerService } from './wager.service';
import logger from '@src/common/logger';

@Controller('wagers')
export class WagerController {
  private readonly context: string = WagerController.name;
  constructor(private readonly wagerService: WagerService) {}

  @Post('create')
  @UseGuards(AuthGuard('jwt'))
  async createWager(
    @GetUser() user: User,
    @Body() dto: CreateWagerDTO,
  ): Promise<{ wager: Wager }> {
    try {
      const wager = await this.wagerService.createWager(user.id, dto);

      logger.info(
        `[${this.context}] ${user.email} created a new wager: ${wager.title}.\n`,
      );

      return { wager };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while creating a new wager. Error: ${error.message}.\n`,
      );

      throw error;
    }
  }

  @Patch(':wagerId')
  @UseGuards(AuthGuard('jwt'))
  async updateWager(
    @GetUser() user: User,
    @Param('wagerId', ParseIntPipe) wagerId: number,
    @Body() dto: UpdateWagerDTO,
  ): Promise<{ message: string }> {
    try {
      await this.wagerService.updateWager(user.id, wagerId, dto);

      return { message: 'Wager updated successfully' };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while updating wager details. Error: ${error.message}.\n`,
      );

      throw error;
    }
  }

  @Post('invite')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async findWagerByInviteCode(
    @Body() dto: WagerInviteDTO,
  ): Promise<{ wager: Wager }> {
    try {
      return { wager: await this.wagerService.findWagerByInviteCode(dto) };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while inviting new player to wager. Error: ${error.message}.\n`,
      );

      throw error;
    }
  }

  @Get(':wagerId')
  @UseGuards(AuthGuard('jwt'))
  async getWagerDetails(
    @Param('wagerId', ParseIntPipe) wagerId: number,
  ): Promise<{ wager: Wager }> {
    try {
      return { wager: await this.wagerService.getWagerDetails(wagerId) };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while retrieving wager details. Error: ${error.message}.\n`,
      );

      throw error;
    }
  }

  @Post(':wagerId/join')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async joinWager(
    @GetUser() user: User,
    @Param('wagerId', ParseIntPipe) wagerId: number,
  ): Promise<{ message: string }> {
    try {
      const wagerTitle = await this.wagerService.joinWager(user.id, wagerId);

      logger.info(
        `[${this.context}] ${user.email} joined ${wagerTitle} wager.\n`,
      );

      return { message: 'Successfully joined wager' };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while joining a new wager. Error: ${error.message}.\n`,
      );

      throw error;
    }
  }

  @Post(':wagerId/claim')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async claimWager(
    @GetUser() user: User,
    @Param('wagerId', ParseIntPipe) wagerId: number,
  ): Promise<{ message: string }> {
    try {
      const wagerTitle = await this.wagerService.claimWager(user.id, wagerId);

      logger.info(
        `[${this.context}] ${user.email} claimed the prize in ${wagerTitle} wager.\n`,
      );

      return {
        message: 'Prize claimed successfully, awaiting response from opponent',
      };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while claiming wager prize. Error: ${error.message}.\n`,
      );

      throw error;
    }
  }

  @Post(':wagerId/claim/accept')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async acceptWagerClaim(
    @Param('wagerId', ParseIntPipe) wagerId: number,
  ): Promise<{ message: string }> {
    try {
      await this.wagerService.acceptWagerClaim(wagerId);
      return { message: 'Wager claim accepted, better luck next time!' };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while accepting wager prize claim. Error: ${error.message}.\n`,
      );

      throw error;
    }
  }

  @Post(':wagerId/claim/contest')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async contestWagerClaim(
    @Param('wagerId', ParseIntPipe) wagerId: number,
  ): Promise<{ message: string }> {
    try {
      await this.wagerService.contestWagerClaim(wagerId);
      return {
        message:
          'Wager claim contested, dispute resolution has been initiated.',
      };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while contesting wager prize claim. Error: ${error.message}.\n`,
      );

      throw error;
    }
  }

  @Delete(':wagerId')
  @UseGuards(AuthGuard('jwt'))
  async deleteWager(
    @GetUser() user: User,
    @Param('wagerId', ParseIntPipe) wagerId: number,
  ): Promise<{ message: string }> {
    try {
      await this.wagerService.deleteWager(user.id, wagerId);

      return { message: 'Wager deleted successfully' };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while deleting wager. Error: ${error.message}.\n`,
      );

      throw error;
    }
  }

  @Get(':wagerId/dispute/chat')
  @UseGuards(AuthGuard('jwt'))
  async getDisputeChatMessages(
    @Param('wagerId', ParseIntPipe) wagerId: number,
  ): Promise<{ messages: Message[] }> {
    try {
      return {
        messages: await this.wagerService.getDisputeChatMessages(wagerId),
      };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while retrieving dispute chat messages. Error: ${error.message}.\n`,
      );

      throw error;
    }
  }

  @Post(':wagerId/dispute/resolve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminGuard)
  async assignWinnerAfterResolution(
    @Param('wagerId', ParseIntPipe) wagerId: number,
    @Body() dto: DisputeResolutionDTO,
  ): Promise<{ message: string }> {
    try {
      await this.wagerService.assignWinnerAfterResolution(wagerId, dto);

      return { message: 'Dispute resolution successful' };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while resolving wager dispute. Error: ${error.message}.\n`,
      );

      throw error;
    }
  }
}
