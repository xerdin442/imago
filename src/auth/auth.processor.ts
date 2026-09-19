import { Injectable } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { sendEmail } from '@src/common/config/mail';
import { Logger } from '@src/common/logger';

@Injectable()
@Processor('auth-queue')
export class AuthProcessor {
  private readonly logger = Logger(AuthProcessor.name);

  constructor() {}

  @Process('signup')
  async signup(job: Job<Record<string, string>>): Promise<void> {
    try {
      const { email } = job.data;
      const subject = 'Welcome Onboard!';
      const content = 'Thanks for signing up';

      await sendEmail(email, subject, content);
    } catch (error) {
      this.logger.error(
        `An error occured while processing onboarding email. Error: ${error.message}`,
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
      this.logger.error(
        `An error occured while processing OTP email. Error: ${error.message}`,
      );

      throw error;
    }
  }
}
