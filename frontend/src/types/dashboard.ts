export type StageKey = string;

export type StageCategory = {
  id: string;
  value: StageKey;
  label: string;
};

export type StageItem = {
  id: string;
  code: string;
  name: string;
  processStage?: string;
  season?: string;
  cutDie?: string;
  area?: string;
  article?: string;
  duration: string;
  mood: string;
  stage: StageKey;
  stageDate?: string | null;
  completed?: boolean;
  videoUrl?: string;
};

export type StageFilters = {
  dateFrom: string;
  dateTo: string;
  season: string;
  stage: string;
  cutDie: string;
  area: string;
  article: string;
  confirmedTableCtOnly?: string;
};

export type HistoryItem = {
  id: string;
  startTime: number;
  endTime: number;
  range: string;
  label: string;
  committed: boolean;
  locked?: boolean;
};

export type ControlSessionItem = {
  id: string;
  stageItemId?: string | null;
  stageCode: string;
  elapsed: number;
  isRunning: boolean;
  segmentStart: number;
  nva: number | null;
  va: number | null;
  skip: number | null;
};

export type CtRow = {
  id: string;
  stageItemId?: string | null;
  no: string;
  partName: string;
  nvaValues: number[];
  vaValues: number[];
  machineType: string;
  confirmed: boolean;
  done: boolean;
};

export type SelectedCtCell = {
  rowId: string;
  stageItemId?: string | null;
  rowNo: string;
  columnIndex: number;
  columnKey: string;
};
