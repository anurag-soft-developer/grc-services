export enum ParticipantStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
}

export enum Gender {
  FEMALE = 'female',
  MALE = 'male',
  OTHER = 'other',
}

export type CustomQuestionResponseValue = string | string[] | boolean;

export interface IRunEventParticipant {
  _id: string;
  runEventId: string;
  fullName?: string;
  contactNumber?: string;
  gender?: Gender;
  instagramHandle?: string;
  city?: string;
  howDidYouHearAboutUs?: string[];
  guidelinesAgreed?: boolean;
  customQuestionResponses: Record<string, CustomQuestionResponseValue>;
  status: ParticipantStatus;
  draftToken: string;
  submittedAt?: Date;
  userId?: string;
  createdAt: Date;
  updatedAt: Date;
}
