import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Check,
  CheckCheck,
  ChevronDown,
  FileSpreadsheet,
  GripVertical,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  fetchMachineTypes,
  type MachineTypeItem,
} from '@/services/machine-types';
import {
  deleteTableCtRow,
  exportLsaWorkbook,
  exportTableCtWorkbook,
} from '@/services/table-ct';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  confirmSelectedTableRows,
  completeTableRow,
  resetTableRowMetricColumn,
  saveTableRow,
  setSelectedCtCell,
  toggleTableRowConfirm,
  updateTableRowMachineType,
} from '@/store/slices/dashboard-slice';
import type { CtRow, SelectedCtCell } from '@/types/dashboard';

const CT_COLUMNS = [
  'CT1',
  'CT2',
  'CT3',
  'CT4',
  'CT5',
  'CT6',
  'CT7',
  'CT8',
  'CT9',
  'CT10',
];

type CtTablePanelProps = {
  rows: CtRow[];
  activeStageItemId: string | null;
  isPlaying?: boolean;
  /** IDs of all stage items currently visible (after applying date/season/etc. filters). Used for LSA export scoping. */
  filteredStageItemIds?: string[];
  onReorder: (activeId: string, overId: string) => void;
  onRefresh: (options?: { ignoreSelection?: boolean }) => Promise<void> | void;
  onToggleStageItemActive: (stageItemId: string | null) => void;
};

type SortableCtRowGroupProps = {
  row: CtRow;
  isActive: boolean;
  isDragging: boolean;
  machineTypeOptions: MachineTypeItem[];
  machineTypeQueries: Record<string, string>;
  openMachineDropdownId: string | null;
  selectedCtCell: SelectedCtCell | null;
  sessionCategory?: string;
  showEnglishOnlyMachineTypes: boolean;
  dispatch: ReturnType<typeof useAppDispatch>;
  onSelectRow: (row: CtRow) => void;
  onToggleStageItemActive: (stageItemId: string | null) => void;
  onSetMachineDropdown: Dispatch<SetStateAction<string | null>>;
  onSetMachineQueries: Dispatch<SetStateAction<Record<string, string>>>;
  onMachineTypeQueryChange: (row: CtRow, query: string) => void;
  onMachineTypeQueryBlur: (row: CtRow) => void;
  onMachineTypeSelect: (id: string, value: string) => Promise<void>;
  onConfirm: (id: string, confirmed: boolean) => Promise<void>;
  onDone: (id: string) => Promise<void>;
  onDelete: (row: CtRow) => Promise<void>;
  isPlaying?: boolean;
};

function SortableCtRowGroup({
  row,
  isActive,
  isDragging,
  machineTypeOptions,
  machineTypeQueries,
  openMachineDropdownId,
  selectedCtCell,
  sessionCategory,
  showEnglishOnlyMachineTypes,
  dispatch,
  onSelectRow,
  onToggleStageItemActive,
  onSetMachineDropdown,
  onSetMachineQueries,
  onMachineTypeQueryChange,
  onMachineTypeQueryBlur,
  onMachineTypeSelect,
  onConfirm,
  onDone,
  onDelete,
  isPlaying,
}: SortableCtRowGroupProps) {
  const isLockedWhilePlaying = Boolean(isPlaying);
  const isCellSelectionLocked = row.confirmed || row.done || isLockedWhilePlaying;
  const isMachineTypeLocked = row.confirmed || row.done || isLockedWhilePlaying;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: sortableDragging,
  } = useSortable({ id: row.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: sortableDragging ? 'none' : transition,
  };

  return (
    <tbody
      ref={setNodeRef}
      style={style}
      className={cn(
        'group transform-gpu will-change-transform cursor-pointer',
        openMachineDropdownId === row.id ? 'relative z-30' : '',
        sortableDragging || isDragging ? 'relative z-10 opacity-80' : '',
      )}
    >
      {['NVA', 'VA'].map((type, idx) => (
        <tr
          key={`${row.no}-${type}`}
          onClick={() => onSelectRow(row)}
          className={cn(
            'transition-all duration-150',
            idx === 0 ? 'border-b border-gray-100 dark:border-slate-700/60' : 'border-b border-gray-200 dark:border-slate-700',
            isActive
              ? 'bg-indigo-50 shadow-[inset_3px_0_0_0_#6366f1] dark:bg-indigo-950/40 dark:shadow-[inset_3px_0_0_0_#818cf8]'
              : 'group-hover:bg-slate-50 dark:group-hover:bg-slate-800/70',
            sortableDragging || isDragging ? 'bg-white dark:bg-slate-900' : '',
          )}
        >
          {idx === 0 ? (
            <td rowSpan={2} className="w-6 align-middle text-center">
              <button
                type="button"
                title="Drag to reorder"
                {...attributes}
                {...listeners}
                onClick={(e) => e.stopPropagation()}
                className="rounded-md p-0.5 touch-none"
              >
                <GripVertical
                  className={cn(
                    'mx-auto h-3 w-3 text-gray-300 dark:text-slate-600',
                    'cursor-grab active:cursor-grabbing',
                  )}
                />
              </button>
            </td>
          ) : null}

          {idx === 0 ? (
            <td rowSpan={2} className="w-10 py-1.5 align-middle text-center">
              <span
                className={cn(
                  'text-xs font-bold transition-colors',
                  isActive ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-400 dark:text-slate-500',
                )}
              >
                {row.no}
              </span>
            </td>
          ) : null}

          {idx === 0 ? (
            <td rowSpan={2} className="w-36 py-1.5 align-middle text-center">
              <span
                className={cn(
                  'text-xs font-medium transition-colors',
                  isActive ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-500 dark:text-slate-400',
                )}
              >
                {row.partName}
              </span>
            </td>
          ) : null}

          <td className="w-14 py-1.5 align-middle text-center">
            <div className="flex justify-center">
              {type === 'NVA' ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-500 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400">
                  <span className="h-1 w-1 rounded-full bg-red-400 dark:bg-red-500" />
                  NVA
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <span className="h-1 w-1 rounded-full bg-emerald-400 dark:bg-emerald-500" />
                  VA
                </span>
              )}
            </div>
          </td>

          {(type === 'NVA' ? row.nvaValues : row.vaValues).map((value, ctIdx) => (
            <td key={ctIdx} className="w-10 py-1.5 align-middle text-center">
              <button
                type="button"
                disabled={isCellSelectionLocked}
                onClick={(event) => {
                  event.stopPropagation();
                  if (isCellSelectionLocked) {
                    return;
                  }
                  const isSelected =
                    selectedCtCell?.rowId === row.id &&
                    selectedCtCell.columnIndex === ctIdx;

                  if (isSelected) {
                    dispatch(setSelectedCtCell(null));
                    onToggleStageItemActive(null);
                    return;
                  }

                  dispatch(
                    setSelectedCtCell({
                      rowId: row.id,
                      stageItemId: row.stageItemId ?? null,
                      rowNo: row.no,
                      columnIndex: ctIdx,
                      columnKey: CT_COLUMNS[ctIdx],
                    }),
                  );
                  onToggleStageItemActive(row.stageItemId ?? null);
                }}
                className={cn(
                  'inline-flex min-w-8 items-center justify-center rounded-md px-1 py-0.5 text-xs font-mono transition-colors',
                  'text-gray-400 dark:text-slate-500',
                  isCellSelectionLocked
                    ? 'cursor-not-allowed opacity-60 hover:bg-transparent'
                    : '',
                  selectedCtCell?.rowId === row.id &&
                    selectedCtCell.columnIndex === ctIdx
                    ? 'bg-blue-100 font-bold text-blue-700 ring-1 ring-blue-300 dark:bg-blue-900/50 dark:text-blue-300 dark:ring-blue-700'
                    : isCellSelectionLocked
                      ? ''
                      : 'hover:bg-gray-100 dark:hover:bg-slate-700',
                )}
              >
                {formatMetricValue(value)}
              </button>
            </td>
          ))}

          <td className="w-14 py-1.5 align-middle text-center">
            <span className="text-xs font-mono text-gray-400 dark:text-slate-500">
              {formatAverage(
                type === 'NVA' ? row.nvaValues : row.vaValues,
                row.done,
                sessionCategory,
              )}
            </span>
          </td>

          {idx === 0 ? (
            <td rowSpan={2} className="w-36 py-1.5 align-middle text-center">
              <div className="flex justify-center">
                <div className="relative w-32">
                  <button
                    type="button"
                    disabled={isMachineTypeLocked}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isMachineTypeLocked) {
                        return;
                      }
                      onSetMachineDropdown((current) =>
                        current === row.id ? null : row.id,
                      );
                      onSetMachineQueries((current) => ({
                        ...current,
                        [row.id]: '',
                      }));
                    }}
                    className={cn(
                      'flex h-7 w-full items-center justify-between rounded-lg border px-3 text-[11px] outline-none transition-all',
                      isMachineTypeLocked
                        ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-600'
                        : row.machineType !== 'Select..'
                          ? 'border-blue-200 bg-blue-50 font-medium text-blue-600 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-400'
                          : 'border-gray-200 bg-gray-50 text-gray-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500',
                    )}
                  >
                    <span className="truncate">
                      {getMachineTypeDisplay(
                        row.machineType,
                        machineTypeOptions,
                        showEnglishOnlyMachineTypes,
                      ) || 'Select...'}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                  </button>

                  {openMachineDropdownId === row.id && !isMachineTypeLocked ? (
                    <div
                      className="absolute left-0 top-[calc(100%+0.25rem)] z-50 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.16)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_18px_40px_rgba(0,0,0,0.5)]"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        autoFocus
                        value={machineTypeQueries[row.id] ?? ''}
                        onChange={(e) =>
                          onMachineTypeQueryChange(row, e.target.value)
                        }
                        onBlur={() => {
                          onMachineTypeQueryBlur(row);
                          setTimeout(() => {
                            onSetMachineDropdown((current) =>
                              current === row.id ? null : current,
                            );
                          }, 120);
                        }}
                        placeholder="Search..."
                        className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-blue-600 dark:focus:ring-blue-900/30"
                      />
                      <div className="mt-2 max-h-44 overflow-y-auto">
                        {getFilteredMachineTypes(
                          row,
                          machineTypeQueries,
                          machineTypeOptions,
                          showEnglishOnlyMachineTypes,
                        ).length === 0 ? (
                          <div className="px-2 py-2 text-[11px] text-slate-400 dark:text-slate-500">
                            No data
                          </div>
                        ) : (
                          getFilteredMachineTypes(
                            row,
                            machineTypeQueries,
                            machineTypeOptions,
                            showEnglishOnlyMachineTypes,
                          ).map((machine) => (
                            <button
                              key={machine.id}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                void onMachineTypeSelect(row.id, machine.label);
                                onSetMachineQueries((current) => {
                                  const next = { ...current };
                                  delete next[row.id];
                                  return next;
                                });
                                onSetMachineDropdown(null);
                              }}
                              className="flex w-full items-center rounded-lg px-2 py-1.5 text-left text-[11px] text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              <span className="truncate">
                                {formatMachineTypeOption(
                                  machine,
                                  showEnglishOnlyMachineTypes,
                                )}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </td>
          ) : null}

          {idx === 0 ? (
            <td rowSpan={2} className="w-16 py-1.5 align-middle text-center">
              <div className="flex justify-center">
                <button
                  type="button"
                  disabled={isLockedWhilePlaying}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isLockedWhilePlaying) {
                      return;
                    }
                    void onConfirm(row.id, row.confirmed);
                  }}
                  title={
                    isLockedWhilePlaying
                      ? 'Cannot confirm while video is playing.'
                      : row.confirmed
                        ? 'Unconfirm row'
                        : 'Confirm row'
                  }
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all',
                    isLockedWhilePlaying
                      ? 'cursor-not-allowed border-gray-200 bg-gray-100 opacity-60 dark:border-slate-700 dark:bg-slate-800'
                      : row.confirmed
                      ? 'border-blue-500 bg-blue-500 dark:border-blue-600 dark:bg-blue-600'
                      : 'border-gray-300 bg-white hover:border-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-blue-500',
                  )}
                >
                  {row.confirmed ? <CheckCheck className="h-3 w-3 text-white" /> : null}
                </button>
              </div>
            </td>
          ) : null}

          {idx === 0 ? (
            <td
              rowSpan={2}
              className="w-16 py-1.5 align-middle text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center gap-1.5">
                <Button
                  size="sm"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isLockedWhilePlaying) {
                      return;
                    }
                    void onDone(row.id);
                  }}
                  disabled={row.confirmed || isLockedWhilePlaying}
                  title={
                    isLockedWhilePlaying
                      ? 'Cannot update done status while video is playing.'
                      : row.done
                        ? 'Mark as not done'
                        : 'Mark row as done'
                  }
                  className={cn(
                    'h-6 rounded-lg border px-2 text-[10px] font-bold shadow-none disabled:pointer-events-auto',
                    row.confirmed || isLockedWhilePlaying
                      ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-600'
                      : row.done
                        ? 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600 dark:border-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/50',
                  )}
                >
                  <Check className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (isLockedWhilePlaying || row.confirmed) {
                      return;
                    }
                    void onDelete(row);
                  }}
                  disabled={row.confirmed || isLockedWhilePlaying}
                  title={
                    isLockedWhilePlaying
                      ? 'Cannot delete while video is playing.'
                      : row.confirmed
                        ? 'Confirmed rows cannot be deleted.'
                        : 'Delete table row'
                  }
                  className={cn(
                    'h-6 rounded-lg border px-2 text-[10px] font-bold shadow-none disabled:pointer-events-auto',
                    row.confirmed || isLockedWhilePlaying
                      ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-600'
                      : 'border-red-200 bg-red-50 text-red-500 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-900/50',
                  )}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </td>
          ) : null}
        </tr>
      ))}
    </tbody>
  );
}

export function CtTablePanel({
  rows,
  activeStageItemId,
  isPlaying,
  filteredStageItemIds,
  onReorder,
  onRefresh,
  onToggleStageItemActive,
}: CtTablePanelProps) {
  const dispatch = useAppDispatch();
  const tableRowsError = useAppSelector((state) => state.dashboard.tableRowsError);
  const activeStage = useAppSelector((state) => state.dashboard.activeStage);
  const selectedCtCell = useAppSelector((state) => state.dashboard.selectedCtCell);
  const sessionCategory = useAppSelector((state) => state.auth.sessionUser.category);
  const sessionFactory = useAppSelector((state) => state.auth.sessionUser.factory);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
  );
  const [activeDragRowId, setActiveDragRowId] = useState<string | null>(null);
  const [machineTypes, setMachineTypes] = useState<MachineTypeItem[]>([]);
  const [machineTypeQueries, setMachineTypeQueries] = useState<
    Record<string, string>
  >({});
  const [openMachineDropdownId, setOpenMachineDropdownId] = useState<string | null>(
    null,
  );
  const [isLsaExportOpen, setIsLsaExportOpen] = useState(false);
  const [estimateOutputInput, setEstimateOutputInput] = useState('0');
  const [lsaExportError, setLsaExportError] = useState('');
  const [isExportingLsa, setIsExportingLsa] = useState(false);
  const [isDoneWarningOpen, setIsDoneWarningOpen] = useState(false);
  const doneWarningTimerRef = useRef<number | null>(null);
  const activeRowStageItemId = activeStageItemId;
  const isLsaCategory = sessionCategory.trim().toUpperCase() === 'LSA';
  const showEnglishOnlyMachineTypes = sessionFactory.trim().toUpperCase() === 'LYM';
  const isTableLocked = Boolean(isPlaying);

  useEffect(() => {
    void fetchMachineTypes()
      .then((items) => {
        setMachineTypes(items);
      })
      .catch(() => {
        setMachineTypes([]);
      });
  }, []);

  useEffect(() => {
    if (isTableLocked) {
      setOpenMachineDropdownId(null);
    }
  }, [isTableLocked]);

  const machineTypeOptions = useMemo(() => machineTypes, [machineTypes]);
  const rowById = useMemo(
    () => new Map(rows.map((row) => [row.id, row])),
    [rows],
  );
  const selectedCtRow = selectedCtCell ? rowById.get(selectedCtCell.rowId) : null;

  const handleToggleRowSelection = (row: CtRow) => {
    const isDeselecting = activeStageItemId === (row.stageItemId ?? null);

    if (isDeselecting) {
      if (selectedCtCell?.rowId === row.id) {
        dispatch(setSelectedCtCell(null));
      }
      onToggleStageItemActive(null);
      return;
    }

    onToggleStageItemActive(row.stageItemId ?? null);
  };

  const handleRefresh = (options?: { ignoreSelection?: boolean }) => {
    if (isTableLocked) {
      return;
    }

    void onRefresh(options);
  };

  const handleMachineType = async (id: string, value: string) => {
    if (isTableLocked) {
      return;
    }

    dispatch(
      updateTableRowMachineType({ id, machineType: value || 'Select..' })
    );

    const result = await dispatch(
      saveTableRow({
        id,
        machineType: value || 'Select..',
      })
    );

    if (saveTableRow.rejected.match(result)) {
      handleRefresh();
    }
  };

  const handleMachineTypeQueryChange = (row: CtRow, query: string) => {
    if (isTableLocked) {
      return;
    }

    setMachineTypeQueries((current) => ({
      ...current,
      [row.id]: query,
    }));

    const matchedMachine = findMachineTypeByQuery(
      query,
      machineTypeOptions,
      showEnglishOnlyMachineTypes,
    );
    if (!matchedMachine) {
      return;
    }

    void handleMachineType(row.id, matchedMachine.label);
  };

  const handleMachineTypeQueryBlur = (row: CtRow) => {
    if (isTableLocked) {
      return;
    }

    const currentQuery = machineTypeQueries[row.id];

    if (currentQuery == null) {
      return;
    }

    const matchedMachine = findMachineTypeByQuery(
      currentQuery,
      machineTypeOptions,
      showEnglishOnlyMachineTypes,
    );

    if (!currentQuery.trim()) {
      void handleMachineType(row.id, '');
    } else if (!matchedMachine) {
      setMachineTypeQueries((current) => ({
        ...current,
        [row.id]: getMachineTypeDisplay(
          row.machineType,
          machineTypeOptions,
          showEnglishOnlyMachineTypes,
        ),
      }));
      return;
    }

    setMachineTypeQueries((current) => {
      const next = { ...current };
      delete next[row.id];
      return next;
    });
  };

  const handleConfirm = async (id: string, confirmed: boolean) => {
    if (isTableLocked) {
      return;
    }

    dispatch(toggleTableRowConfirm(id));

    const result = await dispatch(
      saveTableRow({
        id,
        confirmed: !confirmed,
      })
    );

    if (saveTableRow.rejected.match(result)) {
      handleRefresh();
    }
  };

  const handleDone = async (id: string) => {
    if (isTableLocked) {
      return;
    }

    const row = rows.find((item) => item.id === id);
    const shouldClearSelection = selectedCtCell?.rowId === id && !row?.done;

    const result = await dispatch(completeTableRow(id));

    if (completeTableRow.rejected.match(result)) {
      handleRefresh();
      return;
    }

    if (shouldClearSelection) {
      dispatch(setSelectedCtCell(null));
      if (activeStageItemId === (row?.stageItemId ?? null)) {
        onToggleStageItemActive(null);
      }
    }

    if (openMachineDropdownId === id) {
      setOpenMachineDropdownId(null);
    }
  };

  const handleDelete = async (row: CtRow) => {
    if (isTableLocked) {
      return;
    }

    try {
      await deleteTableCtRow(row.id);

      if (selectedCtCell?.rowId === row.id) {
        dispatch(setSelectedCtCell(null));
      }

      if (activeStageItemId === (row.stageItemId ?? null)) {
        onToggleStageItemActive(null);
        handleRefresh({ ignoreSelection: true });
        return;
      }

      handleRefresh();
    } catch {
      handleRefresh();
    }
  };

  const handleExport = () => {
    if (isTableLocked) {
      return;
    }

    if (rows.length === 0 || rows.some((row) => !row.confirmed)) {
      return;
    }

    if (rows.some((row) => !row.done)) {
      if (doneWarningTimerRef.current) window.clearTimeout(doneWarningTimerRef.current);
      setIsDoneWarningOpen(true);
      doneWarningTimerRef.current = window.setTimeout(() => setIsDoneWarningOpen(false), 3500);
      return;
    }

    void exportTableCtWorkbook({
      stage: activeStage,
      stageItemId: activeStageItemId,
      rowIds: rows.map((row) => row.id),
    }).then((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, '-');

      link.href = url;
      link.download = `time-study-${activeStage.toLowerCase()}-${timestamp}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });
  };

  const workingTimeSeconds = 27000;
  const totalCtSeconds = useMemo(
    () =>
      roundToTwoDecimals(
        rows.reduce((sum, row) => {
          const totalValues = row.nvaValues.map(
            (value, index) => value + (row.vaValues[index] ?? 0)
          );
          const baseCt = calculateAverageNumber(totalValues, sessionCategory);
          const lossRate = getMachineTypeLossRate(
            row.machineType,
            machineTypeOptions
          );
          return sum + baseCt * (1 + lossRate);
        }, 0)
      ),
    [machineTypeOptions, rows, sessionCategory]
  );
  const estimateOutputPairs = Math.max(0, Number(estimateOutputInput) || 0);
  const taktTimeSeconds =
    estimateOutputPairs > 0
      ? roundToTwoDecimals(3600 / estimateOutputPairs)
      : 0;
  const manpowerStandardLabor =
    taktTimeSeconds > 0 ? Math.ceil(totalCtSeconds / taktTimeSeconds) : 0;
  const capacityPerHour =
    totalCtSeconds > 0 ? Math.round(3600 / totalCtSeconds) : 0;
  const unconfirmedRowIds = rows
    .filter((row) => !row.confirmed)
    .map((row) => row.id);
  const canExportWorkbook = !isTableLocked && rows.length > 0 && unconfirmedRowIds.length === 0;

  const handleConfirmMany = async () => {
    if (isTableLocked || unconfirmedRowIds.length === 0) {
      return;
    }

    const result = await dispatch(
      confirmSelectedTableRows({
        ids: unconfirmedRowIds,
        confirmed: true,
      })
    );

    if (confirmSelectedTableRows.rejected.match(result)) {
      handleRefresh();
    }
  };

  const handleResetSelectedColumn = async () => {
    if (
      isTableLocked ||
      !selectedCtCell ||
      !selectedCtRow ||
      selectedCtRow.confirmed ||
      selectedCtRow.done
    ) {
      return;
    }

    const result = await dispatch(
      resetTableRowMetricColumn({
        id: selectedCtCell.rowId,
        columnIndex: selectedCtCell.columnIndex,
      }),
    );

    if (resetTableRowMetricColumn.fulfilled.match(result)) {
      handleRefresh();
      return;
    }

    if (resetTableRowMetricColumn.rejected.match(result)) {
      handleRefresh();
    }
  };

  const handleExportLsa = () => {
    if (isTableLocked) {
      return;
    }

    if (rows.length === 0 || rows.some((row) => !row.confirmed)) {
      return;
    }

    if (rows.some((row) => !row.done)) {
      if (doneWarningTimerRef.current) window.clearTimeout(doneWarningTimerRef.current);
      setIsDoneWarningOpen(true);
      doneWarningTimerRef.current = window.setTimeout(() => setIsDoneWarningOpen(false), 3500);
      return;
    }

    setLsaExportError('');
    setIsLsaExportOpen(true);
  };

  const handleConfirmExportLsa = async () => {
    if (isTableLocked) {
      return;
    }

    if (rows.length === 0) {
      return;
    }

    if (estimateOutputPairs < 0) {
      setLsaExportError('Estimate Output must be 0 or greater.');
      return;
    }

    try {
      setIsExportingLsa(true);
      const blob = await exportLsaWorkbook({
        stage: activeStage,
        stageItemId: activeStageItemId,
        rowIds: rows.map((row) => row.id),
        filteredStageItemIds: filteredStageItemIds ?? [],
        estimateOutputPairs,
        workingTimeSeconds,
        taktTimeSeconds,
        manpowerStandardLabor,
        capacityPerHour,
        totalCtSeconds,
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, '-');

      link.href = url;
      link.download = `lsa-${activeStage.toLowerCase()}-${timestamp}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setIsLsaExportOpen(false);
      setLsaExportError('');
    } catch (error) {
      setLsaExportError(
        error instanceof Error
          ? error.message
          : 'Unable to export LSA workbook.'
      );
    } finally {
      setIsExportingLsa(false);
    }
  };

  const handleCancelExportLsa = () => {
    setIsLsaExportOpen(false);
    setLsaExportError('');
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveDragRowId(null);

    if (!over || active.id === over.id) {
      return;
    }

    const activeRow = rowById.get(String(active.id));
    const overRow = rowById.get(String(over.id));

    if (!activeRow || !overRow) {
      return;
    }

    onReorder(activeRow.id, overRow.id);
  };

  return (
    <>
      <div className="flex min-h-90 flex-col overflow-hidden border-t border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900 lg:h-[38%] lg:min-h-0">
        <div className="flex shrink-0 flex-col gap-3 border-b border-gray-100 px-3 py-2.5 dark:border-slate-700 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-1.5">
            <div className="h-3.5 w-1 rounded-full bg-linear-to-b from-blue-500 to-violet-500" />
            <span className="text-[11px] font-bold tracking-widest text-gray-500 dark:text-slate-400 uppercase">
              TABLE CT
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => void handleConfirmMany()}
              disabled={isTableLocked || unconfirmedRowIds.length === 0}
              title={
                isTableLocked
                  ? 'Cannot confirm while video is playing.'
                  : unconfirmedRowIds.length === 0
                    ? 'All rows are already confirmed.'
                    : 'Confirm all rows'
              }
              className="h-8 rounded-lg border border-blue-200 bg-blue-50 px-3 text-[11px] text-blue-600 shadow-none hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-900/50 disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCheck className="h-3 w-3" />
              Confirm All
            </Button>
            <Button
              size="sm"
              onClick={() => void handleResetSelectedColumn()}
              disabled={
                isTableLocked ||
                !selectedCtCell ||
                !selectedCtRow ||
                selectedCtRow.confirmed ||
                selectedCtRow.done
              }
              title={
                isTableLocked
                  ? 'Cannot reset while video is playing.'
                  : !selectedCtCell
                    ? 'Select a CT column to reset.'
                    : selectedCtRow?.confirmed || selectedCtRow?.done
                      ? 'Locked rows cannot be reset.'
                      : `Reset ${selectedCtCell.columnKey} to 0`
              }
              className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-3 text-[11px] text-slate-600 shadow-none hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </Button>
            {isLsaCategory ? (
              <Button
                size="sm"
                onClick={handleExportLsa}
                disabled={!canExportWorkbook}
                title={
                  isTableLocked
                    ? 'Cannot export while video is playing.'
                    : canExportWorkbook
                    ? 'Export Excel LSA'
                    : 'Please confirm all TableCT rows before exporting.'
                }
                className="h-8 rounded-lg border border-teal-200 bg-teal-50 px-3 text-[11px] text-teal-700 shadow-none hover:bg-teal-100 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-400 dark:hover:bg-teal-900/50 disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileSpreadsheet className="h-3 w-3" />
                Excel LSA
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleExport}
                disabled={!canExportWorkbook}
                title={
                  isTableLocked
                    ? 'Cannot export while video is playing.'
                    : canExportWorkbook
                    ? 'Export Excel Time Study'
                    : 'Please confirm all TableCT rows before exporting.'
                }
                className="h-8 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[11px] text-emerald-600 shadow-none hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/50 disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileSpreadsheet className="h-3 w-3" />
                Excel Time Study
              </Button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {tableRowsError ? (
            <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-[11px] font-medium text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-400">
              {tableRowsError}
            </div>
          ) : null}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={({ active }) => setActiveDragRowId(String(active.id))}
            onDragCancel={() => setActiveDragRowId(null)}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={rows.map((row) => row.id)}
              strategy={verticalListSortingStrategy}
            >
              <table className="w-full min-w-310 border-collapse">
            <thead className="sticky top-0 z-40 bg-gray-50 dark:bg-slate-800/90">
              <tr className="border-b border-gray-100 dark:border-slate-700">
                <th className="w-6 py-2" />
                <th className="w-10 py-2 text-center text-[10px] font-bold tracking-wider text-gray-600 dark:text-slate-400 uppercase">
                  No
                </th>
                <th className="w-36 py-2 text-center text-[10px] font-bold tracking-wider text-gray-600 dark:text-slate-400 uppercase">
                  Part Name
                </th>
                <th className="w-14 py-2 text-center text-[10px] font-bold tracking-wider text-gray-600 dark:text-slate-400 uppercase">
                  Type
                </th>
                {CT_COLUMNS.map((col) => (
                  <th
                    key={col}
                    className="w-10 py-2 text-center text-[10px] font-bold tracking-wider text-gray-600 dark:text-slate-400 uppercase"
                  >
                    {col}
                  </th>
                ))}
                <th className="w-14 py-2 text-center text-[10px] font-bold tracking-wider text-gray-600 dark:text-slate-400 uppercase">
                  Avg
                </th>
                <th className="w-36 py-2 text-center text-[10px] font-bold tracking-wider text-gray-600 dark:text-slate-400 uppercase">
                  Machine Type
                </th>
                <th className="w-16 py-2 text-center text-[10px] font-bold tracking-wider text-gray-600 dark:text-slate-400 uppercase">
                  Confirm
                </th>
                <th className="w-16 py-2 text-center text-[10px] font-bold tracking-wider text-gray-600 dark:text-slate-400 uppercase">
                  Action
                </th>
              </tr>
            </thead>

            {rows.length === 0 ? (
              <tbody>
                <tr>
                  <td
                    colSpan={CT_COLUMNS.length + 9}
                    className="h-55 px-4 py-10 align-middle"
                  >
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-100 dark:bg-slate-800">
                        <FileSpreadsheet className="h-4 w-4 text-gray-300 dark:text-slate-600" />
                      </div>
                      <p className="text-[11px] text-gray-400 dark:text-slate-500">No data</p>
                    </div>
                  </td>
                </tr>
              </tbody>
            ) : (
              rows.map((row) => (
                <SortableCtRowGroup
                  key={row.id}
                  row={row}
                  isActive={activeRowStageItemId === (row.stageItemId ?? null)}
                  isDragging={activeDragRowId === row.id}
                  machineTypeOptions={machineTypeOptions}
                  machineTypeQueries={machineTypeQueries}
                  openMachineDropdownId={openMachineDropdownId}
                  selectedCtCell={selectedCtCell}
                  sessionCategory={sessionCategory}
                  showEnglishOnlyMachineTypes={showEnglishOnlyMachineTypes}
                  dispatch={dispatch}
                  onSelectRow={handleToggleRowSelection}
                  onToggleStageItemActive={onToggleStageItemActive}
                  onSetMachineDropdown={setOpenMachineDropdownId}
                  onSetMachineQueries={setMachineTypeQueries}
                  onMachineTypeQueryChange={handleMachineTypeQueryChange}
                  onMachineTypeQueryBlur={handleMachineTypeQueryBlur}
                  onMachineTypeSelect={handleMachineType}
                  onConfirm={handleConfirm}
                  onDone={handleDone}
                  onDelete={handleDelete}
                  isPlaying={isPlaying}
                />
              ))
            )}
          </table>
            </SortableContext>
          </DndContext>
        </div>
      </div>

      {isLsaExportOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-98 overflow-hidden rounded-[20px] border border-slate-200/80 bg-white shadow-[0_22px_64px_rgba(15,23,42,0.16)] dark:border-slate-700/80 dark:bg-slate-900 dark:shadow-[0_22px_64px_rgba(0,0,0,0.5)]">
            <div className="border-b border-slate-100 px-4 py-3.5 dark:border-slate-700/60">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="h-4 w-1 rounded-full bg-linear-to-b from-teal-500 to-blue-500" />
                    <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
                      LSA Export
                    </span>
                  </div>
                  <h2 className="text-[18px] font-semibold tracking-tight text-slate-700 dark:text-slate-100">
                    Modal Estimate Output
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleCancelExportLsa}
                  className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-3 px-4 py-4">
              <label className="block space-y-1.5">
                <span className="text-[12px] font-medium text-slate-700 dark:text-slate-300">
                  Estimate Output (pairs)
                </span>
                <input
                  type="number"
                  min="0"
                  value={estimateOutputInput}
                  onChange={(event) =>
                    setEstimateOutputInput(event.target.value)
                  }
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-blue-600 dark:focus:ring-blue-900/30"
                />
              </label>

              <div className="space-y-0 rounded-xl border border-slate-100 bg-white dark:border-slate-700/60 dark:bg-slate-800/50">
                <MetricRow
                  label="Working Time"
                  value={`${formatNumber(workingTimeSeconds)} sec`}
                />
                <MetricRow
                  label="Takt Time"
                  value={`${formatNumber(
                    roundToTwoDecimals(taktTimeSeconds)
                  )} sec`}
                />
                <MetricRow
                  label="Total CT"
                  value={`${formatNumber(
                    roundToTwoDecimals(totalCtSeconds)
                  )} sec`}
                  dashed
                />
                <MetricRow
                  label="Manpower Standard labor"
                  value={`${formatNumber(
                    roundToTwoDecimals(manpowerStandardLabor)
                  )} persons`}
                  accent
                  dashed
                />
                <MetricRow
                  label="Capacity"
                  value={`${formatNumber(
                    roundToTwoDecimals(capacityPerHour)
                  )} pairs/hour`}
                />
              </div>

              {lsaExportError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-500 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400">
                  {lsaExportError}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void handleConfirmExportLsa()}
                  disabled={isExportingLsa || isTableLocked}
                  className="h-10 rounded-xl bg-linear-to-r from-emerald-500 to-emerald-600 text-[13px] font-semibold text-white shadow-[0_10px_24px_rgba(16,185,129,0.22)] transition hover:from-emerald-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
                >
                  {isExportingLsa ? 'Exporting...' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={handleCancelExportLsa}
                  disabled={isExportingLsa}
                  className="h-10 rounded-xl bg-linear-to-r from-rose-500 to-red-500 text-[13px] font-semibold text-white shadow-[0_10px_24px_rgba(239,68,68,0.2)] transition hover:from-rose-600 hover:to-red-600 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isDoneWarningOpen ? (
        <div className="fixed right-4 top-4 z-50 flex items-start gap-3 rounded-2xl border border-red-200 bg-white px-4 py-3 shadow-[0_8px_32px_rgba(239,68,68,0.15)] dark:border-red-900/60 dark:bg-slate-900 dark:shadow-[0_8px_32px_rgba(239,68,68,0.1)]">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-red-400" />
          <div>
            <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">Export failed</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Please select &apos;Done&apos; before Exporting.</p>
          </div>
          <button
            type="button"
            onClick={() => setIsDoneWarningOpen(false)}
            className="ml-1 rounded-lg p-0.5 text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </>
  );
}

function formatMachineTypeOption(
  machine: MachineTypeItem,
  englishOnly = false,
) {
  if (englishOnly) {
    return machine.label || 'Unnamed machine type';
  }

  const labelCn = machine.labelCn?.trim();
  const labelVn = machine.labelVn?.trim();

  if (labelCn && labelVn) {
    return `${labelCn}-${labelVn}`;
  }

  return labelCn || labelVn || machine.label || 'Unnamed machine type';
}

function getMachineTypeDisplay(
  machineType: string,
  machineTypes: MachineTypeItem[],
  englishOnly = false,
) {
  if (!machineType || machineType === 'Select..') {
    return '';
  }

  const matchedMachine = machineTypes.find((item) => item.label === machineType);
  return matchedMachine
    ? formatMachineTypeOption(matchedMachine, englishOnly)
    : machineType;
}

function findMachineTypeByQuery(
  query: string,
  machineTypes: MachineTypeItem[],
  englishOnly = false,
) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return null;
  }

  return (
    machineTypes.find((machine) => {
      const displayValue = formatMachineTypeOption(
        machine,
        englishOnly,
      ).toLowerCase();

      if (englishOnly) {
        return (
          displayValue === normalizedQuery ||
          machine.label.toLowerCase() === normalizedQuery
        );
      }

      return (
        displayValue === normalizedQuery ||
        machine.label.toLowerCase() === normalizedQuery ||
        machine.labelCn?.toLowerCase() === normalizedQuery ||
        machine.labelVn?.toLowerCase() === normalizedQuery
      );
    }) ?? null
  );
}

function getFilteredMachineTypes(
  row: CtRow,
  machineTypeQueries: Record<string, string>,
  machineTypeOptions: MachineTypeItem[],
  englishOnly = false,
) {
  const query = (machineTypeQueries[row.id] ?? '').trim().toLowerCase();

  if (!query) {
    return machineTypeOptions;
  }

  return machineTypeOptions.filter((machine) => {
    const displayValue = formatMachineTypeOption(machine, englishOnly).toLowerCase();

    if (englishOnly) {
      return (
        displayValue.includes(query) ||
        machine.label.toLowerCase().includes(query)
      );
    }

    return (
      displayValue.includes(query) ||
      machine.label.toLowerCase().includes(query) ||
      machine.labelCn?.toLowerCase().includes(query) ||
      machine.labelVn?.toLowerCase().includes(query)
    );
  });
}

function formatMetricValue(value: number) {
  return value.toFixed(1);
}

function formatAverage(values: number[], isDone: boolean, category?: string) {
  const normalizedCategory = category?.trim().toUpperCase() ?? '';

  if (!isDone && normalizedCategory !== 'COSTING') {
    return '';
  }

  return calculateAverageNumber(values, normalizedCategory).toFixed(1);
}

function calculateAverageNumber(values: number[], category?: string) {
  const normalizedCategory = category?.trim().toUpperCase() ?? '';
  if (normalizedCategory === 'COSTING') {
    if (values.length === 0) {
      return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / 10;
  }

  const shouldUsePositiveOnly =
    normalizedCategory === 'FF28' || normalizedCategory === 'LSA';
  const valuesForAverage = shouldUsePositiveOnly
    ? values.filter((value) => value > 0)
    : values;

  if (valuesForAverage.length === 0) {
    return 0;
  }

  return (
    valuesForAverage.reduce((sum, value) => sum + value, 0) /
    valuesForAverage.length
  );
}

function roundToTwoDecimals(value: number) {
  return Number(value.toFixed(2));
}

function parseLossRate(value?: string) {
  if (!value) {
    return 0;
  }

  const normalized = value.trim().replace('%', '');
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return parsed > 1 ? parsed / 100 : parsed;
}

function getMachineTypeLossRate(
  machineType: string,
  machineTypes: MachineTypeItem[]
) {
  const matched = machineTypes.find((item) => item.label === machineType);
  return parseLossRate(matched?.loss);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}

function MetricRow({
  label,
  value,
  dashed = false,
  accent = false,
}: {
  label: string;
  value: string;
  dashed?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-3 py-2.5',
        dashed
          ? 'border-t border-dashed border-slate-200 dark:border-slate-700'
          : 'border-t border-slate-100 first:border-t-0 dark:border-slate-700/60'
      )}
    >
      <span className="text-[12px] font-medium text-slate-700 dark:text-slate-300">{label}</span>
      <span
        className={cn(
          'text-right text-[12px] font-semibold text-slate-800 dark:text-slate-200',
          accent ? 'text-blue-600 dark:text-blue-400' : ''
        )}
      >
        {value}
      </span>
    </div>
  );
}
