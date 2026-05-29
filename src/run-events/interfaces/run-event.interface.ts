export enum RunEventStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  CLOSED = 'closed',
}

export enum CustomQuestionType {
  TEXT = 'text',
  TEXTAREA = 'textarea',
  SELECT = 'select',
  RADIO = 'radio',
  CHECKBOX = 'checkbox',
}

export interface IGeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface IRunEventLocation {
  city: string;
  state: string;
  address: string;
  lat: number;
  long: number;
  geo: IGeoPoint;
}

export interface IRunEventLocationInput {
  lat: number;
  long: number;
  city: string;
  state: string;
  address: string;
}

export interface ICustomQuestion {
  key: string;
  label: string;
  type: CustomQuestionType;
  options?: string[];
  required: boolean;
  order: number;
}

export interface IRunEvent {
  _id: string;
  title: string;
  slug: string;
  coverImages: string[];
  description: string;
  eventDate: Date;
  reportingTime: string;
  location: IRunEventLocation;
  price: number;
  currency: string;
  inclusions: string[];
  guidelines: string[];
  customQuestions: ICustomQuestion[];
  status: RunEventStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  distanceMeters?: number;
}
