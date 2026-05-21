export type CreateHistoryDto = {
  stageItemId?: string;
  stageCode: string;
  ctColumn?: string;
  startTime: number;
  endTime: number;
  type: 'NVA' | 'VA' | 'SKIP';
  value: number;
};
