import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { commitHistory, createHistory, deleteHistory, fetchHistory } from '@/services/history';
import { fetchStages } from '@/services/stages';
import { signOut } from '@/store/slices/auth-slice';
import {
  confirmTableCtRows,
  fetchTableCt,
  markTableCtDone,
  updateTableCtMetrics,
  updateTableCtRow,
} from '@/services/table-ct';
import {
  getOfflineHistoryItems,
  getOfflineStages,
  getOfflineTableRows,
  shouldUseOfflineData,
} from '@/lib/offline-api';
import type {
  CtRow,
  HistoryItem,
  SelectedCtCell,
  StageCategory,
  StageFilters,
  StageItem,
  StageKey,
} from '@/types/dashboard';

type DashboardState = {
  orderedStageItems: StageItem[];
  tableRows: CtRow[];
  historyItems: HistoryItem[];
  stageCategories: StageCategory[];
  activeStage: StageKey;
  selectedItemId: string;
  selectedCtCell: SelectedCtCell | null;
  stageItemsError: string;
  tableRowsError: string;
  historyError: string;
};

const initialState: DashboardState = {
  orderedStageItems: [],
  tableRows: [],
  historyItems: [],
  stageCategories: [],
  activeStage: '',
  selectedItemId: '',
  selectedCtCell: null,
  stageItemsError: '',
  tableRowsError: '',
  historyError: '',
};

export const loadStages = createAsyncThunk(
  'dashboard/loadStages',
  async (filters: Partial<StageFilters> | undefined, { rejectWithValue }) => {
    try {
      if (shouldUseOfflineData()) {
        return await getOfflineStages({
          dateFrom: filters?.dateFrom,
          dateTo: filters?.dateTo,
          season: filters?.season,
          stage: filters?.stage,
          area: filters?.area,
          article: filters?.article,
          cutDie: filters?.cutDie,
        });
      }

      return await fetchStages(filters);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to load stage items.',
      );
    }
  },
);

export const loadTableRows = createAsyncThunk(
  'dashboard/loadTableRows',
  async (
    filters: {
      stage?: StageKey;
      stageCode?: string;
      stageItemId?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      if (shouldUseOfflineData()) {
        return getOfflineTableRows(filters);
      }

      return await fetchTableCt(filters);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to load table rows.',
      );
    }
  },
);

export const saveTableRow = createAsyncThunk(
  'dashboard/saveTableRow',
  async (
    payload: {
      id: string;
      machineType?: string;
      confirmed?: boolean;
    },
    { rejectWithValue },
  ) => {
    try {
      return await updateTableCtRow(payload.id, payload);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to update table row.',
      );
    }
  },
);

export const completeTableRow = createAsyncThunk(
  'dashboard/completeTableRow',
  async (id: string, { rejectWithValue }) => {
    try {
      return await markTableCtDone(id);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to mark table row as done.',
      );
    }
  },
);

export const confirmSelectedTableRows = createAsyncThunk(
  'dashboard/confirmSelectedTableRows',
  async (
    payload: {
      ids: string[];
      confirmed?: boolean;
    },
    { rejectWithValue },
  ) => {
    try {
      return await confirmTableCtRows(payload);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to confirm table rows.',
      );
    }
  },
);

export const saveTableRowMetrics = createAsyncThunk(
  'dashboard/saveTableRowMetrics',
  async (
    payload: {
      id: string;
      columnIndex: number;
      nvaValue?: number;
      vaValue?: number;
    },
    { rejectWithValue },
  ) => {
    try {
      return await updateTableCtMetrics(payload.id, payload);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to update table metrics.',
      );
    }
  },
);

export const loadHistoryItems = createAsyncThunk(
  'dashboard/loadHistoryItems',
  async (
    filters: { stageItemId?: string; stageCode?: string } | undefined,
    { rejectWithValue },
  ) => {
    try {
      if (shouldUseOfflineData()) {
        return getOfflineHistoryItems(filters);
      }

      return await fetchHistory(filters);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to load history items.',
      );
    }
  },
);

export const addHistoryItem = createAsyncThunk(
  'dashboard/addHistoryItem',
  async (
    payload: {
      stageCode: string;
      stageItemId?: string;
      startTime: number;
      endTime: number;
      type: 'NVA' | 'VA' | 'SKIP';
      value: number;
    },
    { rejectWithValue },
  ) => {
    try {
      return await createHistory(payload);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to create history item.',
      );
    }
  },
);

export const removeHistoryItem = createAsyncThunk(
  'dashboard/removeHistoryItem',
  async (id: string, { rejectWithValue }) => {
    try {
      await deleteHistory(id);
      return id;
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to delete history item.',
      );
    }
  },
);

export const commitHistoryItems = createAsyncThunk(
  'dashboard/commitHistoryItems',
  async (
    payload: { stageItemId?: string; stageCode?: string },
    { rejectWithValue },
  ) => {
    try {
      return await commitHistory(payload);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to commit history items.',
      );
    }
  },
);

/**
 * Recompute `completed` for stage items that have rows currently in `tableRows`.
 * A stage item is completed when ALL its loaded CT rows are confirmed.
 * Items with no rows in state are left unchanged.
 */
function syncStageItemCompletion(state: DashboardState) {
  const countMap = new Map<string, { total: number; confirmed: number }>();

  for (const row of state.tableRows) {
    const key = row.stageItemId ?? row.no.trim().toUpperCase();
    const current = countMap.get(key) ?? { total: 0, confirmed: 0 };
    countMap.set(key, {
      total: current.total + 1,
      confirmed: current.confirmed + (row.confirmed ? 1 : 0),
    });
  }

  state.orderedStageItems = state.orderedStageItems.map((item) => {
    const counts = countMap.get(item.id) ?? countMap.get(item.code.trim().toUpperCase());
    if (!counts) return item;
    return { ...item, completed: counts.total > 0 && counts.confirmed === counts.total };
  });
}

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    setActiveStage(state, action: PayloadAction<StageKey>) {
      state.activeStage = action.payload;
    },
    setStageCategories(state, action: PayloadAction<StageCategory[]>) {
      state.stageCategories = action.payload;

      if (!state.activeStage && action.payload.length > 0) {
        state.activeStage = action.payload[0].value;
      }
    },
    setSelectedItemId(state, action: PayloadAction<string>) {
      state.selectedItemId = action.payload;
      state.selectedCtCell = null;
    },
    setSelectedCtCell(state, action: PayloadAction<SelectedCtCell | null>) {
      state.selectedCtCell = action.payload;
    },
    setStageItems(state, action: PayloadAction<StageItem[]>) {
      state.orderedStageItems = action.payload;
    },
    appendStageItems(state, action: PayloadAction<StageItem[]>) {
      state.orderedStageItems.push(...action.payload);
    },
    removeStageItem(state, action: PayloadAction<string>) {
      state.orderedStageItems = state.orderedStageItems.filter(
        (item) => item.id !== action.payload,
      );
    },
    setTableRows(state, action: PayloadAction<CtRow[]>) {
      state.tableRows = action.payload;
      if (
        state.selectedCtCell &&
        !action.payload.some((row) => row.id === state.selectedCtCell?.rowId)
      ) {
        state.selectedCtCell = null;
      }
    },
    updateTableRowMachineType(
      state,
      action: PayloadAction<{ id: string; machineType: string }>,
    ) {
      state.tableRows = state.tableRows.map((row) =>
        row.id === action.payload.id
          ? { ...row, machineType: action.payload.machineType }
          : row,
      );
    },
    toggleTableRowConfirm(state, action: PayloadAction<string>) {
      state.tableRows = state.tableRows.map((row) =>
        row.id === action.payload ? { ...row, confirmed: !row.confirmed } : row,
      );
      syncStageItemCompletion(state);
    },
    reorderStageItems(
      state,
      action: PayloadAction<{
        stage: StageKey;
        reorderedScoped: StageItem[];
      }>,
    ) {
      const { stage, reorderedScoped } = action.payload;
      const reorderedQueue = [...reorderedScoped];

      state.orderedStageItems = state.orderedStageItems.map((item) => {
        if (item.stage !== stage) return item;
        return reorderedQueue.shift() ?? item;
      });
    },
    setStageItemsError(state, action: PayloadAction<string>) {
      state.stageItemsError = action.payload;
    },
    setTableRowsError(state, action: PayloadAction<string>) {
      state.tableRowsError = action.payload;
    },
    setHistoryError(state, action: PayloadAction<string>) {
      state.historyError = action.payload;
    },
    setHistoryItems(state, action: PayloadAction<HistoryItem[]>) {
      state.historyItems = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadStages.fulfilled, (state, action) => {
        if (action.payload.length === 0) {
          state.orderedStageItems = [];
          state.tableRows = [];
          state.historyItems = [];
          state.selectedItemId = '';
          state.selectedCtCell = null;
          state.stageItemsError = '';
          return;
        }

        const nextActiveStage = action.payload.some((item) => item.stage === state.activeStage)
          ? state.activeStage
          : action.payload[0].stage;
        const hasSelectedItem = action.payload.some((item) => item.id === state.selectedItemId);

        state.orderedStageItems = action.payload;
        state.activeStage = nextActiveStage;
        state.selectedItemId = hasSelectedItem ? state.selectedItemId : '';
        state.stageItemsError = '';
      })
      .addCase(commitHistoryItems.fulfilled, (state, action) => {
        state.historyItems = action.payload;
        state.historyError = '';
      })
      .addCase(commitHistoryItems.rejected, (state, action) => {
        state.historyError =
          typeof action.payload === 'string'
            ? action.payload
            : 'Unable to commit history items.';
      })
      .addCase(loadStages.rejected, (state, action) => {
        state.stageItemsError =
          typeof action.payload === 'string'
            ? action.payload
            : 'Unable to load stage items.';
      })
      .addCase(loadTableRows.fulfilled, (state, action) => {
        state.tableRows = action.payload;
        if (
          state.selectedCtCell &&
          !action.payload.some((row) => row.id === state.selectedCtCell?.rowId)
        ) {
          state.selectedCtCell = null;
        }
        state.tableRowsError = '';
      })
      .addCase(loadTableRows.rejected, (state, action) => {
        state.tableRowsError =
          typeof action.payload === 'string'
            ? action.payload
            : 'Unable to load table rows.';
      })
      .addCase(saveTableRow.fulfilled, (state, action) => {
        state.tableRows = state.tableRows.map((row) =>
          row.id === action.payload.id ? action.payload : row,
        );
        syncStageItemCompletion(state);
        state.tableRowsError = '';
      })
      .addCase(saveTableRow.rejected, (state, action) => {
        state.tableRowsError =
          typeof action.payload === 'string'
            ? action.payload
            : 'Unable to update table row.';
      })
      .addCase(completeTableRow.fulfilled, (state, action) => {
        state.tableRows = state.tableRows.map((row) =>
          row.id === action.payload.id ? action.payload : row,
        );
        if (action.payload.done && state.selectedCtCell?.rowId === action.payload.id) {
          state.selectedCtCell = null;
        }
        state.tableRowsError = '';
      })
      .addCase(completeTableRow.rejected, (state, action) => {
        state.tableRowsError =
          typeof action.payload === 'string'
            ? action.payload
            : 'Unable to mark table row as done.';
      })
      .addCase(confirmSelectedTableRows.fulfilled, (state, action) => {
        const updatedRows = new Map(action.payload.map((row) => [row.id, row]));
        state.tableRows = state.tableRows.map((row) => updatedRows.get(row.id) ?? row);
        syncStageItemCompletion(state);
        state.tableRowsError = '';
      })
      .addCase(confirmSelectedTableRows.rejected, (state, action) => {
        state.tableRowsError =
          typeof action.payload === 'string'
            ? action.payload
            : 'Unable to confirm table rows.';
      })
      .addCase(saveTableRowMetrics.fulfilled, (state, action) => {
        state.tableRows = state.tableRows.map((row) =>
          row.id === action.payload.id ? action.payload : row,
        );
        state.tableRowsError = '';
      })
      .addCase(saveTableRowMetrics.rejected, (state, action) => {
        state.tableRowsError =
          typeof action.payload === 'string'
            ? action.payload
            : 'Unable to update table metrics.';
      })
      .addCase(loadHistoryItems.fulfilled, (state, action) => {
        state.historyItems = action.payload;
        state.historyError = '';
      })
      .addCase(loadHistoryItems.rejected, (state, action) => {
        state.historyError =
          typeof action.payload === 'string'
            ? action.payload
            : 'Unable to load history items.';
      })
      .addCase(addHistoryItem.fulfilled, (state, action) => {
        state.historyItems.unshift(action.payload);
        state.historyError = '';
      })
      .addCase(addHistoryItem.rejected, (state, action) => {
        state.historyError =
          typeof action.payload === 'string'
            ? action.payload
            : 'Unable to create history item.';
      })
      .addCase(removeHistoryItem.fulfilled, (state, action) => {
        state.historyItems = state.historyItems.filter((item) => item.id !== action.payload);
        state.historyError = '';
      })
      .addCase(removeHistoryItem.rejected, (state, action) => {
        state.historyError =
          typeof action.payload === 'string'
            ? action.payload
            : 'Unable to delete history item.';
      })
      .addCase(signOut, () => initialState)
      .addCase('auth/signIn/fulfilled', () => initialState)
      .addCase('auth/bootstrapSession/rejected', () => initialState);
  },
});

export const {
  appendStageItems,
  removeStageItem,
  reorderStageItems,
  setActiveStage,
  setStageCategories,
  setSelectedCtCell,
  setSelectedItemId,
  setStageItems,
  setStageItemsError,
  setTableRowsError,
  setHistoryItems,
  setHistoryError,
  setTableRows,
  toggleTableRowConfirm,
  updateTableRowMachineType,
} = dashboardSlice.actions;
export const dashboardReducer = dashboardSlice.reducer;
