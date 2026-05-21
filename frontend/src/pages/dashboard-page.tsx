import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ControlPanel } from '@/components/dashboard/control-panel';
import { CreateUserModal } from '@/components/dashboard/create-user-modal';
import { CtTablePanel } from '@/components/dashboard/ct-table-panel';
import { DeleteLogsModal } from '@/components/dashboard/delete-logs-modal';
import { DuplicateStageModal } from '@/components/dashboard/duplicate-stage-modal';
import { FilterPanel } from '@/components/dashboard/filter-panel';
import { HistoryPanel } from '@/components/dashboard/history-panel';
import { ImportShareBundleModal } from '@/components/dashboard/import-share-bundle-modal';
import { ManageStageCategoriesModal } from '@/components/dashboard/manage-stage-categories-modal';
import {
  PreviewPanel,
  type PreviewPlaybackRequest,
  type PreviewPlaybackState,
} from '@/components/dashboard/preview-panel';
import { StageListPanel } from '@/components/dashboard/stage-list-panel';
import { TopBar } from '@/components/dashboard/top-bar';
import type { ThemeMode } from '@/lib/storage';
import { UploadVideoModal } from '@/components/dashboard/upload-video-modal';
import { DashboardLayout } from '@/components/layouts/dashboard-layout';
import { showToast } from '@/components/common/toast';
import { fetchStageCategories } from '@/services/stage-categories';
import { createStages, deleteStage, fetchStages, reorderStages } from '@/services/stages';
import { reorderTableCtRows } from '@/services/table-ct';
import { syncOfflineSnapshot } from '@/services/sync';
import {
  buildOfflineShareBundle,
  getOfflineSyncStatus,
  OFFLINE_REACHABILITY_EVENT,
  OFFLINE_SYNC_EVENT,
  restoreOfflineShareBundle,
} from '@/lib/offline-api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  loadHistoryItems,
  appendStageItems,
  loadStages as loadStagesThunk,
  loadTableRows,
  removeStageItem,
  reorderStageItems,
  setActiveStage,
  setStageCategories,
  setHistoryItems,
  setSelectedCtCell,
  setSelectedItemId,
  setStageItems,
  setStageItemsError,
  setTableRows,
} from '@/store/slices/dashboard-slice';
import type { CtRow, StageFilters, StageItem, StageKey } from '@/types/dashboard';
import type { HistoryItem } from '@/types/dashboard';

type DashboardPageProps = {
  displayName: string;
  subtitle: string;
  role: string;
  onSignOut: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
};

function reorderItems<T extends { id: string }>(
  items: T[],
  activeId: string,
  overId: string
) {
  const fromIndex = items.findIndex((item) => item.id === activeId);
  const toIndex = items.findIndex((item) => item.id === overId);

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function sortRowsByStageItems(rows: CtRow[], items: StageItem[]) {
  const order = new Map(items.map((item, index) => [item.code.toUpperCase(), index]));

  return [...rows].sort((a, b) => {
    const aIndex = order.get(a.no.toUpperCase());
    const bIndex = order.get(b.no.toUpperCase());

    if (aIndex == null && bIndex == null) return 0;
    if (aIndex == null) return 1;
    if (bIndex == null) return -1;
    return aIndex - bIndex;
  });
}

export function DashboardPage({
  displayName,
  subtitle,
  role,
  onSignOut,
  theme,
  onToggleTheme,
}: DashboardPageProps) {
  const dispatch = useAppDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const [stageTabs, setStageTabs] = useState<StageKey[]>([]);
  const {
    activeStage,
    orderedStageItems,
    selectedItemId,
    stageItemsError,
    tableRows,
    stageCategories,
  } =
    useAppSelector((state) => state.dashboard);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isDuplicateOpen, setIsDuplicateOpen] = useState(false);
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [isDeleteLogsOpen, setIsDeleteLogsOpen] = useState(false);
  const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);
  const [isShareImportOpen, setIsShareImportOpen] = useState(false);
  const [activeLinkedItemId, setActiveLinkedItemId] = useState<string | null>(null);
  const [hideCompletedStageItems, setHideCompletedStageItems] = useState(false);
  const [deletedHistoryItem, setDeletedHistoryItem] = useState<HistoryItem | null>(null);
  const [playbackState, setPlaybackState] = useState<PreviewPlaybackState>({
    currentTime: 0,
    duration: 0,
    isPlaying: false,
  });
  const [playbackRequest, setPlaybackRequest] = useState<PreviewPlaybackRequest | null>(null);
  const [stageFilters, setStageFilters] = useState<StageFilters>(() =>
    getFiltersFromSearchParams(searchParams),
  );

  useEffect(() => {
    void refreshStageTabs().catch(() => {});
  }, []);

  useEffect(() => {
    void fetchStageCategories()
      .then((categories) => {
        dispatch(setStageCategories(categories));
      })
      .catch(() => {});
  }, [dispatch]);

  useEffect(() => {
    if (!activeStage && stageTabs[0]) {
      dispatch(setActiveStage(stageTabs[0]));
    }
  }, [activeStage, dispatch, stageTabs]);

  useEffect(() => {
    const nextFilters = getFiltersFromSearchParams(searchParams);

    setStageFilters((current) =>
      areStageFiltersEqual(current, nextFilters) ? current : nextFilters,
    );
  }, [searchParams]);

  useEffect(() => {
    const nextSearchParams = buildSearchParams(stageFilters);
    const currentSearch = searchParams.toString();
    const nextSearch = nextSearchParams.toString();

    if (currentSearch !== nextSearch) {
      setSearchParams(nextSearchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, stageFilters]);

  const loadStages = async () => {
    const result = await dispatch(loadStagesThunk(stageFilters));

    if (loadStagesThunk.rejected.match(result)) {
      throw new Error(
        typeof result.payload === 'string'
          ? result.payload
          : 'Unable to load stage items.',
      );
    }
  };

  function issuePlaybackRequest(
    request:
      | { type: 'play' }
      | { type: 'pause' }
      | { type: 'seek'; time: number },
  ) {
    setPlaybackRequest({
      ...request,
      token: Date.now(),
    } as PreviewPlaybackRequest);
  }

  const reloadDashboardDataSource = async () => {
    issuePlaybackRequest({ type: 'pause' });
    setActiveLinkedItemId(null);
    dispatch(setSelectedItemId(''));
    dispatch(setSelectedCtCell(null));
    dispatch(setHistoryItems([]));
    dispatch(setTableRows([]));

    await refreshStageTabs();
    await loadStages();
  };

  const refreshStageTabs = async () => {
    const categories = await fetchStageCategories();
    dispatch(setStageCategories(categories));

    const categoryTabs = categories
      .map((category) => category.value)
      .filter((value): value is StageKey => value.trim().length > 0);

    if (categoryTabs.length > 0) {
      const nextTabs = Array.from(new Set(categoryTabs));
      setStageTabs(nextTabs);
      if (!nextTabs.includes(activeStage)) {
        dispatch(setActiveStage(nextTabs[0]));
      }
      return nextTabs;
    }

    const allStages = await fetchStages();
    const nextTabs = Array.from(
      new Set(
        allStages
          .map((item) => item.stage)
          .filter((value): value is StageKey => value.trim().length > 0),
      ),
    );
    setStageTabs(nextTabs);
    if (nextTabs.length > 0 && !nextTabs.includes(activeStage)) {
      dispatch(setActiveStage(nextTabs[0]));
    }
    return nextTabs;
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleDataSourceChange = () => {
      void reloadDashboardDataSource().catch((error) => {
        dispatch(
          setStageItemsError(
            error instanceof Error ? error.message : 'Unable to reload dashboard data.',
          ),
        );
      });
    };
    const handleSyncStateChange = () => {
      if (getOfflineSyncStatus().pending) {
        return;
      }

      handleDataSourceChange();
    };

    window.addEventListener('offline', handleDataSourceChange);
    window.addEventListener('online', handleDataSourceChange);
    window.addEventListener(OFFLINE_SYNC_EVENT, handleSyncStateChange);
    window.addEventListener(
      OFFLINE_REACHABILITY_EVENT,
      handleDataSourceChange as EventListener,
    );

    return () => {
      window.removeEventListener('offline', handleDataSourceChange);
      window.removeEventListener('online', handleDataSourceChange);
      window.removeEventListener(OFFLINE_SYNC_EVENT, handleSyncStateChange);
      window.removeEventListener(
        OFFLINE_REACHABILITY_EVENT,
        handleDataSourceChange as EventListener,
      );
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, stageFilters]);

  useEffect(() => {
    void loadStages()
      .catch((error) => {
        dispatch(setStageItemsError(
          error instanceof Error ? error.message : 'Unable to load stage items.',
        ));
      });
  }, [dispatch, stageFilters]);

  const filteredItems = useMemo(
    () =>
      orderedStageItems.filter(
        (item) =>
          item.stage === activeStage &&
          (!hideCompletedStageItems || !item.completed),
      ),
    [activeStage, hideCompletedStageItems, orderedStageItems]
  );

  const selectedItem =
    orderedStageItems.find((item) => item.id === selectedItemId) ?? undefined;
  const visibleStageItemIds = useMemo(
    () => new Set(filteredItems.map((item) => item.id)),
    [filteredItems],
  );
  const visibleCodes = useMemo(
    () => new Set(filteredItems.map((item) => item.code.toUpperCase())),
    [filteredItems],
  );
  const visibleTableRows = useMemo(
    () =>
      tableRows.filter((row) =>
        row.stageItemId
          ? visibleStageItemIds.has(row.stageItemId)
          : visibleCodes.has(row.no.toUpperCase()),
      ),
    [tableRows, visibleCodes, visibleStageItemIds],
  );

  useEffect(() => {
    if (!selectedItem) {
      void dispatch(
        loadTableRows({
          stage: activeStage,
        }),
      );
      return;
    }

    void dispatch(
      loadTableRows({
        stage: selectedItem.stage,
        stageCode: selectedItem.code,
        stageItemId: selectedItem.id,
      }),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStage, dispatch, selectedItem?.code, selectedItem?.stage, selectedItemId]);

  useEffect(() => {
    if (!selectedItem?.id) {
      dispatch(setHistoryItems([]));
      return;
    }

    void dispatch(
      loadHistoryItems({
        stageItemId: selectedItem.id,
        stageCode: selectedItem.code,
      }),
    );
  }, [dispatch, selectedItem?.code, selectedItem?.id]);

  useEffect(() => {
    if (!hideCompletedStageItems || !activeLinkedItemId) {
      return;
    }

    const activeLinkedItem = orderedStageItems.find((item) => item.id === activeLinkedItemId);
    if (!activeLinkedItem?.completed) {
      return;
    }

    setActiveLinkedItemId(null);
    dispatch(setSelectedItemId(''));
    dispatch(setHistoryItems([]));
    dispatch(setSelectedCtCell(null));
  }, [activeLinkedItemId, dispatch, hideCompletedStageItems, orderedStageItems]);

  useEffect(() => {
    const activeId = activeLinkedItemId ?? selectedItemId;

    if (!activeId) {
      return;
    }

    const itemStillVisible = filteredItems.some((item) => item.id === activeId);

    if (itemStillVisible) {
      return;
    }

    setActiveLinkedItemId(null);
    dispatch(setSelectedItemId(''));
    dispatch(setHistoryItems([]));
    dispatch(setSelectedCtCell(null));
  }, [activeLinkedItemId, dispatch, filteredItems, selectedItemId]);

  const handleRefreshTable = async (options?: { ignoreSelection?: boolean }) => {
    if (selectedItem && !options?.ignoreSelection) {
      await dispatch(
        loadTableRows({
          stage: selectedItem.stage,
          stageCode: selectedItem.code,
          stageItemId: selectedItem.id,
        }),
      );

      await dispatch(
        loadHistoryItems({
          stageItemId: selectedItem.id,
          stageCode: selectedItem.code,
        }),
      );
      return;
    }

    await dispatch(
      loadTableRows({
        stage: activeStage,
      }),
    );

    dispatch(setHistoryItems([]));
  };

  const handleStageReorder = (activeId: string, overId: string) => {
    const stageScoped = orderedStageItems.filter((item) => item.stage === activeStage);
    const visibleStageScoped = stageScoped.filter(
      (item) => !hideCompletedStageItems || !item.completed,
    );
    const reorderedVisibleScoped = reorderItems(visibleStageScoped, activeId, overId);
    const reorderedVisibleIds = reorderedVisibleScoped.map((item) => item.id);
    const reorderedVisibleQueue = [...reorderedVisibleScoped];
    const reorderedScoped = stageScoped.map((item) => {
      if (!reorderedVisibleIds.includes(item.id)) {
        return item;
      }

      return reorderedVisibleQueue.shift() ?? item;
    });

    const syncedRows = sortRowsByStageItems(tableRows, reorderedScoped);

    dispatch(setTableRows(syncedRows));
    dispatch(
      reorderStageItems({
        stage: activeStage,
        reorderedScoped,
      }),
    );
    dispatch(setStageItemsError(''));

    void reorderStages({
      stage: activeStage,
      orderedIds: reorderedScoped.map((item) => item.id),
    }).catch((error) => {
      dispatch(setStageItemsError(
        error instanceof Error ? error.message : 'Unable to save stage order.',
      ));

      void loadStages().catch(() => {});
    });

    void reorderTableCtRows({
      stage: activeStage,
      orderedIds: syncedRows.map((row) => row.id),
    }).catch(() => {
      void dispatch(
        loadTableRows({
          stage: activeStage,
        }),
      );
    });
  };

  const handleTableReorder = (activeId: string, overId: string) => {
    const nextRows = reorderItems(tableRows, activeId, overId);
    const relevantCodes = new Set(nextRows.map((row) => row.no.toUpperCase()));
    const stageScoped = orderedStageItems.filter(
      (item) => item.stage === activeStage && relevantCodes.has(item.code.toUpperCase())
    );
    const orderedCodes = nextRows.map((row) => row.no.toUpperCase());
    const sortedScoped = [...stageScoped].sort(
      (a, b) =>
        orderedCodes.indexOf(a.code.toUpperCase()) -
        orderedCodes.indexOf(b.code.toUpperCase())
    );

    const scopedQueue = [...sortedScoped];
    const nextItems = orderedStageItems.map((item) => {
      if (item.stage !== activeStage || !relevantCodes.has(item.code.toUpperCase())) {
        return item;
      }
      return scopedQueue.shift() ?? item;
    });

    dispatch(setStageItems(nextItems));
    dispatch(setTableRows(nextRows));

    const nextStageScoped = nextItems.filter((item) => item.stage === activeStage);

    void reorderTableCtRows({
      stage: activeStage,
      orderedIds: nextRows.map((row) => row.id),
    }).catch(() => {
      void dispatch(
        loadTableRows({
          stage: activeStage,
        }),
      );
    });

    void reorderStages({
      stage: activeStage,
      orderedIds: nextStageScoped.map((item) => item.id),
    }).catch((error) => {
      dispatch(setStageItemsError(
        error instanceof Error ? error.message : 'Unable to save stage order.',
      ));

      void loadStages().catch(() => {});
    });
  };

  const handleUpload = async (payload: {
    date: string;
    season: string;
    stageCode: string;
    cutDie: string;
    area: StageKey;
    article: string;
    files: File[];
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  }) => {
    await createStages(payload);
    const refreshedItems = await fetchStages(stageFilters);

    dispatch(setStageItems(refreshedItems));
    dispatch(setActiveStage(payload.area));
    await refreshStageTabs();
    setIsUploadOpen(false);
  };

  const handleSyncNow = async () => {
    try {
      await syncOfflineSnapshot();
      const refreshedCategories = await fetchStageCategories();
      dispatch(setStageCategories(refreshedCategories));
      await refreshStageTabs();
      await loadStages();
      await handleRefreshTable();
      dispatch(setStageItemsError(''));
      showToast({
        title: 'Sync completed',
        description: 'Your local changes are now on the server.',
        variant: 'success',
      });
    } catch (error) {
      dispatch(
        setStageItemsError(
          error instanceof Error ? error.message : 'Unable to sync offline data.',
        ),
      );
      showToast({
        title: 'Sync failed',
        description:
          error instanceof Error ? error.message : 'Unable to sync offline data.',
        variant: 'error',
      });
      throw error;
    }
  };

  const handleExportShareBundle = async () => {
    try {
      const bundle = await buildOfflineShareBundle();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ie-share-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      anchor.click();
      URL.revokeObjectURL(url);

      showToast({
        title: 'Share bundle exported',
        description: 'You can send this file to another user.',
        variant: 'success',
      });
    } catch (error) {
      showToast({
        title: 'Export failed',
        description:
          error instanceof Error ? error.message : 'Unable to export share bundle.',
        variant: 'error',
      });
      throw error;
    }
  };

  const handleImportShareBundle = () => {
    setIsShareImportOpen(true);
  };

  const handleShareBundleImport = async (payload: {
    bundle: unknown;
    mode: 'replace' | 'merge-stage-data';
  }) => {
    try {
      await restoreOfflineShareBundle(payload.bundle, { mode: payload.mode });
      setIsShareImportOpen(false);
      showToast({
        title: 'Share bundle imported',
        description:
          payload.mode === 'replace'
            ? 'Local data has been replaced with the imported bundle.'
            : 'Stage data has been merged into local data.',
        variant: 'success',
      });

      void refreshDataAfterImport();
    } catch (error) {
      showToast({
        title: 'Import failed',
        description:
          error instanceof Error ? error.message : 'Unable to import share bundle.',
        variant: 'error',
      });
      throw error;
    }
  };

  const refreshDataAfterImport = async () => {
    try {
      const refreshedCategories = await fetchStageCategories();
      dispatch(setStageCategories(refreshedCategories));
      await refreshStageTabs();
      await loadStages();
      await handleRefreshTable({ ignoreSelection: true });
    } catch (error) {
      showToast({
        title: 'Data refresh warning',
        description:
          error instanceof Error ? error.message : 'Imported data was saved, but UI refresh failed.',
        variant: 'info',
      });
    }
  };

  const handleDeleteStage = async (id: string) => {
    const targetItem = orderedStageItems.find((item) => item.id === id);
    if (!targetItem) return;

    try {
      await deleteStage(id);

      dispatch(removeStageItem(id));

      if (selectedItemId === id) {
        dispatch(setSelectedItemId(''));
      }
      if (activeLinkedItemId === id) {
        setActiveLinkedItemId(null);
      }

      dispatch(
        setTableRows(
          tableRows.filter((row) => row.no.toUpperCase() !== targetItem.code.toUpperCase()),
        ),
      );

      dispatch(setStageItemsError(''));

      showToast({
        title: 'Video deleted',
        description: `"${targetItem.code}. ${targetItem.name}" was deleted successfully.`,
        variant: 'success',
      });
    } catch (error) {
      showToast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Unable to delete this video.',
        variant: 'error',
      });
    }
  };

  const handleDuplicate = (items: StageItem[], targetArea: StageKey) => {
    dispatch(appendStageItems(items));
    dispatch(setActiveStage(targetArea));
    setIsDuplicateOpen(false);
  };

  useEffect(() => {
    if (!activeLinkedItemId) {
      return;
    }

    const itemStillExists = orderedStageItems.some((item) => item.id === activeLinkedItemId);
    if (!itemStillExists) {
      setActiveLinkedItemId(null);
    }
  }, [activeLinkedItemId, orderedStageItems]);

  return (
    <>
      <ImportShareBundleModal
        open={isShareImportOpen}
        onClose={() => setIsShareImportOpen(false)}
        onImport={handleShareBundleImport}
      />

      <DashboardLayout
        topBar={
          <TopBar
            onOpenFilter={() => setIsFilterOpen(true)}
            onOpenCreateUser={() => setIsCreateUserOpen(true)}
            onOpenDeleteLogs={() => setIsDeleteLogsOpen(true)}
            onOpenManageStageCategories={() => setIsManageCategoriesOpen(true)}
            onSyncNow={handleSyncNow}
            onExportShareBundle={handleExportShareBundle}
            onImportShareBundle={handleImportShareBundle}
            onSignOut={onSignOut}
            displayName={displayName}
            subtitle={subtitle}
            role={role}
            theme={theme}
            onToggleTheme={onToggleTheme}
          />
        }
        sidebar={
          <StageListPanel
            tabs={stageTabs}
            activeStage={activeStage}
            items={filteredItems}
            selectedItemId={activeLinkedItemId ?? ''}
            onStageChange={(value) => {
              dispatch(setActiveStage(value));
              dispatch(setSelectedItemId(''));
              dispatch(setTableRows([]));
              dispatch(setHistoryItems([]));
              setActiveLinkedItemId(null);
            }}
            onSelectItem={(value) => {
              if (activeLinkedItemId === value) {
                dispatch(setSelectedItemId(''));
                dispatch(setHistoryItems([]));
                dispatch(setSelectedCtCell(null));
                setActiveLinkedItemId(null);
                return;
              }

              setActiveLinkedItemId(value);
              dispatch(setSelectedItemId(value));
            }}
            onReorder={handleStageReorder}
            onDeleteItem={handleDeleteStage}
            onOpenUpload={() => setIsUploadOpen(true)}
            onOpenDuplicate={() => setIsDuplicateOpen(true)}
            onToggleHideCompleted={() => setHideCompletedStageItems((value) => !value)}
            hideCompleted={hideCompletedStageItems}
            isPlaying={playbackState.isPlaying}
            errorMessage={stageItemsError}
          />
        }
        controlPanel={
          <>
            <ControlPanel
              playbackState={playbackState}
              onPlay={() => issuePlaybackRequest({ type: 'play' })}
              onPause={() => issuePlaybackRequest({ type: 'pause' })}
              onSeek={(time) => issuePlaybackRequest({ type: 'seek', time })}
              deletedHistoryItem={deletedHistoryItem}
            />
            <HistoryPanel
              isPlaying={playbackState.isPlaying}
              onSelectItem={(item) => {
                issuePlaybackRequest({ type: 'pause' });
                issuePlaybackRequest({ type: 'seek', time: item.startTime });
              }}
              onDeleteApplied={(item) => {
                setDeletedHistoryItem(item);
              }}
            />
          </>
        }
        content={
          <>
            <PreviewPanel
              selectedItem={selectedItem}
              playbackRequest={playbackRequest}
              onPlaybackStateChange={setPlaybackState}
            />
            <CtTablePanel
              rows={visibleTableRows}
              activeStageItemId={activeLinkedItemId}
              isPlaying={playbackState.isPlaying}
              filteredStageItemIds={orderedStageItems.map((item) => item.id)}
              onReorder={handleTableReorder}
              onRefresh={handleRefreshTable}
              onToggleStageItemActive={(stageItemId) => {
                setActiveLinkedItemId(stageItemId);
                if (!stageItemId) {
                  dispatch(setSelectedItemId(''));
                  dispatch(setHistoryItems([]));
                  dispatch(setSelectedCtCell(null));
                  return;
                }

                if (stageItemId !== selectedItemId) {
                  dispatch(setSelectedItemId(stageItemId));
                }
              }}
            />
          </>
        }
        overlay={
          <>
            <FilterPanel
              open={isFilterOpen}
              categories={stageCategories}
              onClose={() => setIsFilterOpen(false)}
              value={stageFilters}
              onApply={setStageFilters}
              onReset={() =>
                setStageFilters({
                  dateFrom: getTodayFilterDate(),
                  dateTo: getTodayFilterDate(),
                  season: '',
                  stage: '',
                  cutDie: '',
                  area: '',
                  article: '',
                })
              }
            />
            <DuplicateStageModal
              open={isDuplicateOpen}
              categories={stageCategories}
              defaultArea={activeStage}
              onClose={() => setIsDuplicateOpen(false)}
              onDuplicate={handleDuplicate}
            />
            <UploadVideoModal
              open={isUploadOpen}
              categories={stageCategories}
              defaultArea={activeStage}
              onClose={() => setIsUploadOpen(false)}
              onUpload={handleUpload}
            />
            <CreateUserModal
              open={isCreateUserOpen}
              onClose={() => setIsCreateUserOpen(false)}
            />
            <DeleteLogsModal
              open={isDeleteLogsOpen}
              onClose={() => setIsDeleteLogsOpen(false)}
            />
            <ManageStageCategoriesModal
              open={isManageCategoriesOpen}
              onClose={() => setIsManageCategoriesOpen(false)}
              onChanged={(categories) => {
                dispatch(setStageCategories(categories));
              }}
            />
          </>
        }
      />
    </>
  );
}

function getFiltersFromSearchParams(searchParams: URLSearchParams): StageFilters {
  const today = getTodayFilterDate();

  return {
    dateFrom: searchParams.get('dateFrom') ?? today,
    dateTo: searchParams.get('dateTo') ?? today,
    season: searchParams.get('season') ?? '',
    stage: searchParams.get('stage') ?? '',
    cutDie: searchParams.get('cutDie') ?? '',
    area: searchParams.get('area') ?? '',
    article: searchParams.get('article') ?? '',
  };
}

function buildSearchParams(filters: StageFilters) {
  const next = new URLSearchParams();

  (Object.entries(filters) as Array<[keyof StageFilters, string]>).forEach(([key, value]) => {
    const normalized = value.trim();

    if (normalized) {
      next.set(key, normalized);
    }
  });

  return next;
}

function areStageFiltersEqual(left: StageFilters, right: StageFilters) {
  return (
    left.dateFrom === right.dateFrom &&
    left.dateTo === right.dateTo &&
    left.season === right.season &&
    left.stage === right.stage &&
    left.cutDie === right.cutDie &&
    left.area === right.area &&
    left.article === right.article
  );
}

function getTodayFilterDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
