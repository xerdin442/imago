import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
  BaseWsExceptionFilter,
  ConnectedSocket,
  WebSocketServer,
} from '@nestjs/websockets';
import { UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { Transaction } from '@prisma/client';
import { DbService } from '@src/db/db.service';
import logger from '@src/common/logger';

@UsePipes(
  new ValidationPipe({ exceptionFactory: (errors) => new WsException(errors) }),
)
@UseFilters(new BaseWsExceptionFilter())
@WebSocketGateway(8080, { path: 'wallet/transactions' })
export class WalletGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server: Server;

  private readonly context: string = WalletGateway.name;

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
        `[${this.context}] Client connected to wallet gateway: ${email}\n`,
      );
    } catch (error) {
      logger.info(
        `[${this.context}] An error occurred while connecting to wallet gateway. Error: ${error.message}\n`,
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
        `[${this.context}] An error occurred while disconnecting from wallet gateway. Error: ${error.message}\n`,
      );

      throw error;
    }
  }

  sendTransactionStatus(email: string, transaction: Transaction): void {
    try {
      const client = Array.from(this.server.sockets.sockets.values()).find(
        (socket) => socket.data.email === email,
      );

      if (client) {
        client.emit('status', transaction);
      } else {
        throw new WsException(
          `Transaction notification failed: No active socket for ${email}.`,
        );
      }
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while notifying client of transaction status. Error: ${error.message}`,
      );

      throw error;
    }
  }
}
