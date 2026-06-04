import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buildNowServingSms,
  buildQueueTokenSms,
  parseSmsLocale,
} from './sms-messages';

export type SmsPayload = {
  to: string;
  body: string;
};

/**
 * Optional SMS gateway (Ethiopia: configure provider URL + API key in .env).
 * When disabled, messages are logged at debug level only.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<boolean>('sms.enabled') === true;
  }

  async send(payload: SmsPayload): Promise<void> {
    if (!this.enabled) {
      this.logger.debug(`SMS (disabled): ${payload.to} — ${payload.body}`);
      return;
    }

    const url = this.config.get<string>('sms.apiUrl');
    const apiKey = this.config.get<string>('sms.apiKey');
    if (!url || !apiKey) {
      this.logger.warn('SMS enabled but SMS_API_URL or SMS_API_KEY missing');
      return;
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ to: payload.to, message: payload.body }),
      });
      if (!res.ok) {
        this.logger.warn(`SMS provider returned ${res.status}`);
      }
    } catch (err) {
      this.logger.warn(
        `SMS send failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }

  private smsLocale() {
    return parseSmsLocale(this.config.get<string>('sms.locale'));
  }

  async notifyQueueToken(
    phone: string,
    clinicName: string,
    tokenNumber: number,
  ): Promise<void> {
    const body = buildQueueTokenSms(
      this.smsLocale(),
      clinicName,
      tokenNumber,
    );
    await this.send({ to: phone, body });
  }

  async notifyNowServing(
    phone: string,
    clinicName: string,
    tokenNumber: number,
  ): Promise<void> {
    const body = buildNowServingSms(this.smsLocale(), clinicName, tokenNumber);
    await this.send({ to: phone, body });
  }
}
