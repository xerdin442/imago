import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
  BaseWsExceptionFilter,
  ConnectedSocket,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
} from '@nestjs/websockets';
import { UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { DbService } from '@src/db/db.service';
import logger from '@src/common/logger';

@UsePipes(
  new ValidationPipe({ exceptionFactory: (errors) => new WsException(errors) }),
)
@UseFilters(new BaseWsExceptionFilter())
@WebSocketGateway(8080, { path: 'wagers/dispute' })
export class WagerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server: Server;

  private readonly context: string = WagerGateway.name;

  constructor(private readonly prisma: DbService) {}

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      // Reject the connection if email is not provided
      const email = client.handshake.query.email as string;
      if (!email) throw new WsException('Missing email query parameter');

      // Reject the connection if no user exists with email address
      const user = await this.prisma.user.findUnique({
        where: { email },
      });
      if (!user) throw new WsException('Invalid email address');

      client.data.email = email; // Attach email to the socket instance

      logger.info(
        `[${this.context}] Client connected to wager gateway: ${email}\n`,
      );
    } catch (error) {
      logger.info(
        `[${this.context}] An error occurred while connecting to wager gateway. Error: ${error.message}\n`,
      );

      throw error;
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket): void {
    try {
      const email = client.data?.email as string;
      if (email) {
        logger.info(`[${this.context}] Client disconnected: ${email}`);
      }
    } catch (error) {
      logger.info(
        `[${this.context}] An error occurred while disconnecting from wager gateway. Error: ${error.message}\n`,
      );

      throw error;
    }
  }

  async joinDisputeChat(
    chatId: number,
    admin: string,
    players: number[],
  ): Promise<void> {
    try {
      const members: string[] = [admin];

      // Get the email addresses of the players
      for (const player of players) {
        const user = await this.prisma.user.findUniqueOrThrow({
          where: { id: player },
        });

        members.push(user.email);
      }

      // Add the admin and players to the chat room
      for (const member of members) {
        const client = Array.from(this.server.sockets.sockets.values()).find(
          (socket) => socket.data.email === member,
        );

        if (client) await client.join(`room-${chatId}`);
      }
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while joining private chat. Error: ${error.message}`,
      );

      throw error;
    }
  }

  @SubscribeMessage('send_message')
  async handleMessage(
    @MessageBody() data: Record<string, string>,
  ): Promise<void> {
    try {
      const { chatId, author, content } = data;

      if (!chatId || !author || !content)
        throw new WsException('Invalid chat message structure');

      // Store new messages
      const message = await this.prisma.message.create({
        data: { author, content, chatId: parseInt(chatId) },
      });

      // Broadcast new message to the dispute chat room
      this.server.to(`room-${chatId}`).emit('new_message', {
        author,
        content,
        time: message.createdAt,
      });
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while receiving new messages in chat. Error: ${error.message}`,
      );

      throw error;
    }
  }
}
