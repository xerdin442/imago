import { Injectable } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { sendEmail } from '@src/common/config/mail';
import logger from '@src/common/logger';

@Injectable()
@Processor('auth-queue')
export class AuthProcessor {
  private readonly context: string = AuthProcessor.name;

  constructor() {}

  @Process('signup')
  async signup(job: Job<Record<string, string>>): Promise<void> {
    try {
      const { email } = job.data;
      const subject = 'Welcome Onboard!';
      const content = 'Thanks for signing up';

      await sendEmail(email, subject, content);
    } catch (error) {
      logger.error(
        `[${this.context}] An error occured while processing onboarding email. Error: ${error.message}\n`,
      );

      throw error;
    }
  }

  @Process('otp')
  async passwordReset(job: Job<Record<string, string>>): Promise<void> {
    try {
      const { email, otp } = job.data;
      const subject = 'Password Reset';
      const content = `This is your OTP: ${otp}. It is valid for one hour.`;

      await sendEmail(email, subject, content);
    } catch (error) {
      logger.error(
        `[${this.context}] An error occured while processing OTP email. Error: ${error.message}\n`,
      );

      throw error;
    }
  }
}
