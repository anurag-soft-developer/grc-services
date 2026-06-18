export interface IRajorpayOrder {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: string;
  attempts: number;
  created_at: number;
}

export interface IRajorpayPaymentLink {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  accept_partial: boolean;
  description: string;
  order_id?: string;
  reference_id: string;
  short_url: string;
  status: string;
  expire_by?: number;
  created_at: number;
}

export interface IRajorpayPaymentLinkCustomer {
  name?: string;
  email?: string;
  contact?: string;
}

export interface ICreateRajorpayPaymentLinkParams {
  amountInPaise: number;
  referenceId: string;
  description: string;
  callbackUrl: string;
  expireBy?: number;
  customer?: IRajorpayPaymentLinkCustomer;
  notes?: Record<string, string>;
}
