export const SMS_SEGMENT_LENGTH = 160;

export const smsSegmentCount = (text: string, segmentLength: number = SMS_SEGMENT_LENGTH): number => {
  const length = (text || "").length;
  if (length <= 0) return 0;
  return Math.floor((length - 1) / segmentLength) + 1;
};

export const smsSegmentError = (
  text: string,
  maxSegments: number = 1,
  segmentLength: number = SMS_SEGMENT_LENGTH,
): string | null => {
  const segments = smsSegmentCount(text, segmentLength);
  if (segments <= maxSegments) return null;
  return `This message will be billed as ${segments} segments (${(text || "").length} characters). Example: 320 characters = 2 SMS billed.`;
};
