export const GENDERS = ['female', 'male', 'other'] as const;
export const HEAR_ABOUT_US_OPTIONS = ['instagram', 'friends', 'other'] as const;

export interface CommonFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'select' | 'radio' | 'checkbox';
  options?: readonly string[];
  required: boolean;
  order: number;
}

export const COMMON_FIELDS: CommonFieldDefinition[] = [
  {
    key: 'fullName',
    label: 'Full Name',
    type: 'text',
    required: true,
    order: 1,
  },
  {
    key: 'contactNumber',
    label: 'Contact Number',
    type: 'text',
    required: true,
    order: 2,
  },
  {
    key: 'gender',
    label: 'Gender',
    type: 'radio',
    options: GENDERS,
    required: true,
    order: 3,
  },
  {
    key: 'instagramHandle',
    label: 'Instagram Handle',
    type: 'text',
    required: true,
    order: 4,
  },
  {
    key: 'city',
    label: 'Which city are you participating from?',
    type: 'text',
    required: true,
    order: 5,
  },
  {
    key: 'howDidYouHearAboutUs',
    label: 'How did you hear about us?',
    type: 'checkbox',
    options: HEAR_ABOUT_US_OPTIONS,
    required: true,
    order: 6,
  },
  {
    key: 'guidelinesAgreed',
    label: 'I have read and agree to the Guidelines',
    type: 'checkbox',
    required: true,
    order: 7,
  },
];
