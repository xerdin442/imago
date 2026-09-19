import * as cheerio from 'cheerio';
import { Attachment, Resend } from 'resend';
import { Secrets } from '../secrets';
import logger from '../logger';

export const sendEmail = async (
  recipient: string,
  subject: string,
  content: string,
  attachments?: Attachment[],
): Promise<void> => {
  const context: string = 'Mail Service';

  // Generate HTML from email content
  const $ = cheerio.load(content);
  const htmlContent = $.html();

  // Initialize Resend client
  const resend = new Resend(Secrets.RESEND_EMAIL_API_KEY);

  // Send email to recipient
  const response = await resend.emails.send({
    from: `${Secrets.APP_NAME} <${Secrets.APP_EMAIL}>`,
    subject,
    to: recipient,
    html: htmlContent,
    attachments,
  });

  if (response.data) {
    logger.info(
      `[${context}] "${subject}" email sent successfully to ${recipient}.\n`,
    );
    return;
  }

  if (response.error) {
    logger.error(
      `[${context}] An error occured while sending "${subject}" email to ${recipient}. Error: ${response.error.message}\n`,
    );
    return;
  }
};
