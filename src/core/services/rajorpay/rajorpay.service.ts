import { BadRequestException, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../../config/env.config';
import {
  ICreateRajorpayPaymentLinkParams,
  IRajorpayOrder,
  IRajorpayPaymentLink,
  IRajorpayPaymentLinkCustomer,
} from '../../interfaces/rajorpay.interface';

@Injectable()
export class RajorpayService {
  private static readonly DEFAULT_CURRENCY = 'INR';
  private static readonly API_BASE = 'https://api.razorpay.com';
  static readonly PAYMENT_LINK_MIN_EXPIRY_SECONDS = 20 * 60;

  async createOrder(amount: number, receipt: string): Promise<IRajorpayOrder> {
    const amountInPaise = Math.round(amount * 100);
    return this.apiRequest<IRajorpayOrder>('/v1/orders', {
      method: 'POST',
      body: JSON.stringify({
        amount: amountInPaise,
        currency: RajorpayService.DEFAULT_CURRENCY,
        receipt,
      }),
    });
  }

  async getOrder(orderId: string): Promise<IRajorpayOrder | null> {
    try {
      return await this.apiRequest<IRajorpayOrder>(`/v1/orders/${orderId}`, {
        method: 'GET',
      });
    } catch {
      return null;
    }
  }

  isOrderReusable(order: IRajorpayOrder, expectedAmountRupees: number): boolean {
    return (
      order.status === 'created' &&
      order.amount === Math.round(expectedAmountRupees * 100)
    );
  }

  async createPaymentLink(
    params: ICreateRajorpayPaymentLinkParams,
  ): Promise<IRajorpayPaymentLink> {
    const customer = this.buildPaymentLinkCustomer(params.customer);

    return this.apiRequest<IRajorpayPaymentLink>('/v1/payment_links', {
      method: 'POST',
      body: JSON.stringify({
        amount: params.amountInPaise,
        currency: RajorpayService.DEFAULT_CURRENCY,
        accept_partial: false,
        description: params.description,
        reference_id: params.referenceId,
        callback_url: params.callbackUrl,
        callback_method: 'get',
        notify: { sms: false, email: false },
        reminder_enable: false,
        ...(params.expireBy ? { expire_by: params.expireBy } : {}),
        ...(customer ? { customer } : {}),
        ...(params.notes && Object.keys(params.notes).length > 0
          ? { notes: params.notes }
          : {}),
      }),
    });
  }

  async getPaymentLink(paymentLinkId: string): Promise<IRajorpayPaymentLink | null> {
    try {
      return await this.apiRequest<IRajorpayPaymentLink>(
        `/v1/payment_links/${paymentLinkId}`,
        { method: 'GET' },
      );
    } catch {
      return null;
    }
  }

  isPaymentLinkReusable(
    link: IRajorpayPaymentLink,
    expectedAmountPaise: number,
  ): boolean {
    return link.status === 'created' && link.amount === expectedAmountPaise;
  }

  verifyPaymentLinkSignature(params: {
    paymentLinkId: string;
    referenceId: string;
    status: string;
    paymentId: string;
    signature: string;
  }): boolean {
    const payload = [
      params.paymentLinkId,
      params.referenceId,
      params.status,
      params.paymentId,
    ].join('|');
    const expectedSignature = createHmac('sha256', config.RAJORPAY_KEY_SECRET)
      .update(payload)
      .digest('hex');

    return this.safeEqualSignatures(expectedSignature, params.signature);
  }

  verifyPaymentSignature(params: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): boolean {
    const expectedSignature = createHmac('sha256', config.RAJORPAY_KEY_SECRET)
      .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
      .digest('hex');

    return this.safeEqualSignatures(
      expectedSignature,
      params.razorpaySignature,
    );
  }

  verifyWebhookSignature(
    rawPayload: string | Buffer,
    signature: string,
  ): boolean {
    if (!config.RAJORPAY_WEBHOOK_SECRET) {
      throw new BadRequestException('Webhook secret is not configured');
    }
    const expectedSignature = createHmac(
      'sha256',
      config.RAJORPAY_WEBHOOK_SECRET,
    )
      .update(rawPayload)
      .digest('hex');
    return this.safeEqualSignatures(expectedSignature, signature);
  }

  private async apiRequest<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${RajorpayService.API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: this.getBasicAuthHeader(),
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!response.ok) {
      const description =
        typeof body.error === 'object' &&
        body.error !== null &&
        'description' in body.error
          ? String((body.error as { description?: string }).description)
          : typeof body.error === 'string'
            ? body.error
            : 'Razorpay API request failed';
      throw new BadRequestException(description);
    }

    return body as T;
  }

  private buildPaymentLinkCustomer(
    customer?: IRajorpayPaymentLinkCustomer,
  ): Record<string, string> | undefined {
    if (!customer) {
      return undefined;
    }

    const result: Record<string, string> = {};
    const name = customer.name?.trim();
    const email = customer.email?.trim();
    const contact = customer.contact?.trim();

    if (name) {
      result.name = name;
    }
    if (email) {
      result.email = email;
    }
    if (contact) {
      result.contact = contact;
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  private getBasicAuthHeader(): string {
    const credentials = `${config.RAJORPAY_KEY_ID}:${config.RAJORPAY_KEY_SECRET}`;
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
  }

  private safeEqualSignatures(expected: string, actual: string): boolean {
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);
    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, actualBuffer);
  }
}
