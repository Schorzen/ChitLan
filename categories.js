// ChitLan — RandomChat matching categories, chosen once during onboarding
// (and required before any protected page loads — see requireVerifiedUser
// in auth.js). Blends interests, life stage, and purpose into one simple
// pick-one list rather than several separate questions.

export const CATEGORIES = [
  { id: 'just-chatting', label: 'Just Chatting', iconName: 'chat' },
  { id: 'music-entertainment', label: 'Music & Entertainment', iconName: 'music' },
  { id: 'sports-fitness', label: 'Sports & Fitness', iconName: 'flame' },
  { id: 'food-cooking', label: 'Food & Cooking', iconName: 'food' },
  { id: 'travel-tourism', label: 'Travel & Tourism', iconName: 'pin' },
  { id: 'students', label: 'Students', iconName: 'edit' },
  { id: 'work-business', label: 'Work & Business', iconName: 'briefcase' },
  { id: 'family-parenting', label: 'Family & Parenting', iconName: 'heart' },
];

export const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));
