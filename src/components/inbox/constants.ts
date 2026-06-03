export const AVATAR_COLOR = "from-gray-200 to-gray-300";

// SMS can be billed across multiple segments. We allow up to this many before
// blocking the send so longer texts (with personalization) still go through.
export const SMS_MAX_SEGMENTS = 5;

/** Number of contacts fetched per page for the inbox infinite-scroll list. */
export const CONTACTS_PAGE_SIZE = 10;
