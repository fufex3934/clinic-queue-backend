import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('smtp.host');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.configService.get<number>('smtp.port', 587),
        secure: this.configService.get<boolean>('smtp.secure', false),
        auth: {
          user: this.configService.get<string>('smtp.user'),
          pass: this.configService.get<string>('smtp.password'),
        },
      });
    }
  }

  isConfigured(): boolean {
    return Boolean(this.transporter);
  }

  async sendPasswordResetEmail(
    to: string,
    resetToken: string,
  ): Promise<boolean> {
    const frontendUrl = this.configService.get<string>(
      'app.frontendUrl',
      'http://localhost:3001',
    );
    const resetUrl = `${frontendUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(resetToken)}`;

    const subject = 'Reset your Clinic Queue password';
    const text = `You requested a password reset. Open this link within 1 hour:\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`;
    const html = `
      <p>You requested a password reset for Clinic Queue.</p>
      <p><a href="${resetUrl}">Reset your password</a></p>
      <p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>
    `;

    return this.sendMail(to, subject, text, html);
  }

  private async sendMail(
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn('SMTP not configured — email not sent');
      return false;
    }

    const from = this.configService.get<string>(
      'smtp.from',
      'noreply@clinic-queue.local',
    );

    try {
      await this.transporter.sendMail({ from, to, subject, text, html });
      this.logger.log(`Email sent to ${to}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}`, error);
      return false;
    }
  }
}
