/**
 * Payload-First Security TDD specification for Wayfarer Atlas Firestore rules.
 * Verifies the "Dirty Dozen" adversarial payloads are rejected by firestore.rules.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Shadow Field Injection on Itinerary Create',
    operation: 'create',
    path: '/itineraries/itin-shadow-1',
    auth: { uid: 'user-a', email_verified: true },
    payload: {
      ownerId: 'user-a',
      ownerName: 'Alex',
      title: 'Kyoto Walk',
      destination: 'Kyoto, Japan',
      travelMode: 'WALKING',
      pace: 'balanced',
      daysCount: 2,
      summary: 'Two days of temples.',
      days: [],
      sources: [],
      isPublic: false,
      isFeatured: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Identity Spoofing on Itinerary Create',
    operation: 'create',
    path: '/itineraries/itin-spoof-1',
    auth: { uid: 'attacker', email_verified: true },
    payload: { ownerId: 'victim', title: 'Spoofed Trip' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Unverified Email Write on CollabList',
    operation: 'create',
    path: '/collabLists/list-unverified-1',
    auth: { uid: 'user-unverified', email_verified: false },
    payload: { ownerId: 'user-unverified', title: 'Unverified List' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'ID Poisoning with Invalid Characters',
    operation: 'create',
    path: '/itineraries/bad$id!with*symbols',
    auth: { uid: 'user-a', email_verified: true },
    payload: { ownerId: 'user-a' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'PII Cross-User Read on Users Collection',
    operation: 'get',
    path: '/users/victim-uid',
    auth: { uid: 'attacker', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Immutable OwnerId Tampering on Itinerary Update',
    operation: 'update',
    path: '/itineraries/itin-1',
    auth: { uid: 'user-a', email_verified: true },
    payload: { ownerId: 'user-b' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Client Timestamp Forgery on Experience Create',
    operation: 'create',
    path: '/experiences/exp-time-1',
    auth: { uid: 'user-a', email_verified: true },
    payload: {
      authorId: 'user-a',
      createdAt: '2020-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Orphaned Subcollection Item Write',
    operation: 'create',
    path: '/collabLists/nonexistent-list/items/item-1',
    auth: { uid: 'user-a', email_verified: true },
    payload: { listId: 'nonexistent-list', placeName: 'Ghost Stop' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Non-Member Item Mutation on Private CollabList',
    operation: 'create',
    path: '/collabLists/private-list-1/items/item-2',
    auth: { uid: 'outsider', email_verified: true },
    payload: { listId: 'private-list-1', placeName: 'Intruder Stop' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Non-Atomic LikesCount Inflation on Experience',
    operation: 'update',
    path: '/experiences/exp-1',
    auth: { uid: 'user-b', email_verified: true },
    payload: { likesCount: 50 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Oversized Array Denial-of-Wallet Payload',
    operation: 'create',
    path: '/experiences/exp-big-1',
    auth: { uid: 'user-a', email_verified: true },
    payload: {
      authorId: 'user-a',
      tags: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Comment on Unpublished Draft Experience',
    operation: 'create',
    path: '/experiences/draft-exp-1/comments/comment-1',
    auth: { uid: 'user-b', email_verified: true },
    payload: { experienceId: 'draft-exp-1', body: 'Unauthorized comment' },
    expected: 'PERMISSION_DENIED',
  },
];
