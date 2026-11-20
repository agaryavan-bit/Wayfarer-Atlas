# Wayfarer Atlas Firestore Security Specification

## 1. Data Invariants
1. **PII Isolation**: `/users/{userId}` holds user email/profile and is strictly readable and writable only by `request.auth.uid == userId`. No `list` queries are permitted on `/users`.
2. **Itinerary Ownership & Temporal Integrity**: Every itinerary in `/itineraries/{itineraryId}` must belong to `request.auth.uid`, enforce `createdAt == request.time` on creation, keep `ownerId` and `createdAt` immutable on updates, and bound `days` (<= 14) and `sources` (<= 25).
3. **Collaborative List Master Gate**: Every member record under `/collabLists/{listId}/members/{memberId}` and item under `/collabLists/{listId}/items/{itemId}` must reference an existing parent `/collabLists/{listId}`. Only the owner or a registered member in `/collabLists/{listId}/members/{request.auth.uid}` can add, update, or remove items.
4. **Experience Integrity & Atomic Likes**: Every experience in `/experiences/{experienceId}` starts with `likesCount == 0`. Appreciation toggles must atomically pair `/experiences/{experienceId}/likes/{request.auth.uid}` with a `+1` or `-1` delta on `likesCount`, enforced via `existsAfter` / `getAfter`.
5. **Verified Writes & Strict Schemas**: Every write requires `request.auth.token.email_verified == true`, valid document IDs (`^[a-zA-Z0-9_\-]+$`, `<= 128` chars), strict `hasAll`/`hasOnly` key allowlists on create, and action-scoped `affectedKeys().hasOnly(...)` on update.
6. **Zero Blanket List Reads**: Every `allow list` rule evaluates `resource.data` directly without `get()` or `exists()` lookups.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return `PERMISSION_DENIED`)
1. **Shadow Field Injection (Itinerary)**: Create itinerary with extra ghost key `"isFeatured": true`.
2. **Identity Spoofing (Itinerary)**: Create itinerary with `ownerId: "victim-uid"` while authenticated as `"attacker-uid"`.
3. **Unverified Email Write**: Attempt to create a `collabLists` document when `request.auth.token.email_verified == false`.
4. **ID Poisoning**: Attempt to create `/itineraries/<200-char-invalid-id!@#>` violating `isValidId()`.
5. **PII Blanket Scrape**: Non-owner attempts `get` on `/users/victim-uid` or `list` on `/users`.
6. **Immutable Field Tampering**: Owner attempts to update `ownerId` or `createdAt` on an existing itinerary.
7. **Timestamp Forgery**: Create an experience with client-supplied `createdAt` instead of `request.time`.
8. **Orphaned Subcollection Write**: Create `/collabLists/nonexistent-list/items/item-1` without an existing parent list.
9. **Unauthorized Collaborator Mutation**: Non-member attempts to create or edit an item inside a private `collabLists/{listId}/items/{itemId}`.
10. **Non-Atomic Like Inflation**: Update `likesCount` on `/experiences/{expId}` by `+50` without creating `/experiences/{expId}/likes/{uid}`.
11. **Oversized String / Array Denial of Wallet**: Create an experience with 20 tags (> 8) or a 10KB title string (> 160 chars).
12. **Comment on Unpublished Draft**: Non-author attempts to create a comment on an experience where `isPublished == false`.
