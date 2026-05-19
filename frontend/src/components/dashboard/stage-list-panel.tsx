import { useMemo, useRef, useState } from 'react';
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
  AlertTriangle,
  Copy,
  FileVideo,
  Filter,
  GripVertical,
  Plus,
  Trash2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { StageItem, StageKey } from '@/types/dashboard';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type StageListPanelProps = {
  tabs: StageKey[];
  activeStage: StageKey;
  items: StageItem[];
  selectedItemId: string;
  errorMessage?: string;
  onStageChange: (stage: StageKey) => void;
  onSelectItem: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onDeleteItem: (id: string) => void;
  onOpenUpload: () => void;
  onOpenDuplicate: () => void;
  onToggleHideCompleted: () => void;
  hideCompleted: boolean;
  isPlaying?: boolean;
};

type SortableStageCardProps = {
  item: StageItem;
  isActive: boolean;
  isPlaying?: boolean;
  displayName: string;
  onSelectItem: (id: string) => void;
  onRequestDelete: (item: StageItem) => void;
};

function SortableStageCard({
  item,
  isActive,
  isPlaying,
  displayName,
  onSelectItem,
  onRequestDelete,
}: SortableStageCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelectItem(item.id)}
      className={cn(
        'group relative flex cursor-pointer items-center gap-2 rounded-xl border px-2 py-2 transition-all duration-200 transform-gpu will-change-transform',
        isActive
          ? 'border-indigo-300 bg-indigo-50 shadow-sm ring-1 ring-indigo-200/60 dark:border-indigo-800 dark:bg-indigo-950/50 dark:ring-indigo-800/60'
          : 'border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-800/60',
        isDragging
          ? 'scale-[1.02] border-gray-200 bg-white opacity-70 shadow-xl dark:border-slate-700 dark:bg-slate-800'
          : ''
      )}
    >
      {isActive && !isDragging ? (
        <div className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-linear-to-b from-indigo-500 to-violet-500 shadow-sm" />
      ) : null}

      <button
        type="button"
        title="Drag to reorder"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 rounded-md p-0.5 touch-none"
      >
        <GripVertical
          className={cn(
            'h-3.5 w-3.5 cursor-grab transition active:cursor-grabbing',
            isActive
              ? 'text-indigo-300 dark:text-indigo-600'
              : 'text-gray-200 group-hover:text-gray-400 dark:text-slate-700 dark:group-hover:text-slate-500'
          )}
        />
      </button>

      <div
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition',
          isActive
            ? 'bg-indigo-500 dark:bg-indigo-600'
            : 'bg-gray-100 group-hover:bg-gray-200 dark:bg-slate-700 dark:group-hover:bg-slate-600'
        )}
      >
        <FileVideo
          className={cn(
            'h-3 w-3 transition',
            isActive ? 'text-white' : 'text-gray-400 dark:text-slate-500'
          )}
        />
      </div>

      <div className="min-w-0 flex-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <p
              className={cn(
                'truncate text-xs transition cursor-default',
                isActive
                  ? 'font-bold text-indigo-700 dark:text-indigo-400'
                  : 'font-medium text-gray-600 group-hover:text-gray-800 dark:text-slate-400 dark:group-hover:text-slate-200'
              )}
            >
              {displayName}
            </p>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {displayName}
          </TooltipContent>
        </Tooltip>
      </div>

      <button
        type="button"
        disabled={isPlaying}
        onClick={(e) => {
          e.stopPropagation();
          if (isPlaying) return;
          onRequestDelete(item);
        }}
        title={
          isPlaying ? 'Cannot delete while video is playing' : 'Delete item'
        }
        className={cn(
          'rounded-lg p-1 text-gray-300 opacity-0 transition-all group-hover:opacity-100 dark:text-slate-600',
          isPlaying
            ? 'cursor-not-allowed'
            : 'hover:bg-red-50 hover:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-400'
        )}
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

export function StageListPanel({
  tabs,
  activeStage,
  items,
  selectedItemId,
  errorMessage,
  onStageChange,
  onSelectItem,
  onReorder,
  onDeleteItem,
  onOpenUpload,
  onOpenDuplicate,
  onToggleHideCompleted,
  hideCompleted,
  isPlaying,
}: StageListPanelProps) {
  const tabsScrollRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({
    isMouseDown: false,
    isDragging: false,
    startX: 0,
    scrollLeft: 0,
  });
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    })
  );
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<StageItem | null>(
    null
  );
  const displayNamesById = useMemo(
    () => getStageDisplayNamesById(items),
    [items]
  );

  const handleTabsMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tabsScrollRef.current) return;

    dragStateRef.current = {
      isMouseDown: true,
      isDragging: false,
      startX: e.clientX,
      scrollLeft: tabsScrollRef.current.scrollLeft,
    };
  };

  const handleTabsMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = tabsScrollRef.current;
    if (!container || !dragStateRef.current.isMouseDown) return;

    const deltaX = e.clientX - dragStateRef.current.startX;
    if (!dragStateRef.current.isDragging && Math.abs(deltaX) > 4) {
      dragStateRef.current.isDragging = true;
    }

    if (!dragStateRef.current.isDragging) return;

    container.scrollLeft = dragStateRef.current.scrollLeft - deltaX;
  };

  const handleTabsMouseUp = () => {
    dragStateRef.current.isMouseDown = false;

    window.setTimeout(() => {
      dragStateRef.current.isDragging = false;
    }, 0);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveDragId(null);

    if (!over || active.id === over.id) {
      return;
    }

    onReorder(String(active.id), String(over.id));
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-gray-100 px-3 py-2.5 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="h-3.5 w-1 rounded-full bg-linear-to-b from-blue-500 to-violet-500" />
            <span className="text-[11px] font-bold tracking-widest text-gray-500 dark:text-slate-400 uppercase">
              Stage List
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onToggleHideCompleted}
              title={
                hideCompleted ? 'Show completed items' : 'Hide completed items'
              }
              className={cn(
                'rounded-lg p-1.5 transition',
                hideCompleted
                  ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/50'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-300'
              )}
            >
              <Filter className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onOpenDuplicate}
              title="Duplicate"
              className="rounded-lg bg-violet-50 p-1.5 text-violet-600 transition hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-400 dark:hover:bg-violet-900/50"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onOpenUpload}
              title="Add"
              className="rounded-lg bg-blue-50 p-1.5 text-blue-600 transition hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-900/50"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="shrink-0 px-2 pt-2 pb-1">
        <div
          ref={tabsScrollRef}
          className="tabs-scroll overflow-x-auto overflow-y-hidden rounded-2xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800/60"
          onMouseDown={handleTabsMouseDown}
          onMouseMove={handleTabsMouseMove}
          onMouseUp={handleTabsMouseUp}
          onMouseLeave={handleTabsMouseUp}
        >
          <div className="flex min-w-max gap-1">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => onStageChange(tab)}
                className={cn(
                  'h-9 shrink-0 whitespace-nowrap rounded-xl px-3 text-[11px] font-semibold tracking-wide transition-all',
                  activeStage === tab
                    ? 'bg-white text-slate-700 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                    : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
                )}
                onDragStart={(e) => e.preventDefault()}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
        <div
          className={cn(
            'flex flex-col gap-0.5',
            items.length === 0 ? 'h-full' : ''
          )}
        >
          {errorMessage ? (
            <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-400">
              {errorMessage}
            </div>
          ) : null}

          {items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 dark:bg-slate-800">
                <FileVideo className="h-5 w-5 text-gray-300 dark:text-slate-600" />
              </div>
              <p className="text-[11px] text-gray-400 dark:text-slate-500">
                No stages yet
              </p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={({ active }) => setActiveDragId(String(active.id))}
              onDragCancel={() => setActiveDragId(null)}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={items.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                {items.map((item) => (
                  <SortableStageCard
                    key={item.id}
                    item={item}
                    isActive={
                      selectedItemId === item.id || activeDragId === item.id
                    }
                    isPlaying={isPlaying}
                    displayName={
                      displayNamesById.get(item.id) ??
                      formatStageDisplayName(item)
                    }
                    onSelectItem={onSelectItem}
                    onRequestDelete={(item) => setPendingDeleteItem(item)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {pendingDeleteItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_22px_64px_rgba(0,0,0,0.42)]">
            <div className="flex flex-col items-center gap-3 px-6 pt-6 pb-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/50">
                <AlertTriangle className="h-6 w-6 text-red-500 dark:text-red-400" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">
                  Confirm video deletion
                </p>
                <p className="mt-1 text-[12px] leading-5 text-slate-500 dark:text-slate-400">
                  Are you sure you want to delete{' '}
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {pendingDeleteItem.code}. {pendingDeleteItem.name}
                  </span>
                  ? This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2 px-6 py-4">
              <button
                type="button"
                onClick={() => setPendingDeleteItem(null)}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteItem(pendingDeleteItem.id);
                  setPendingDeleteItem(null);
                }}
                className="flex-1 rounded-xl bg-red-500 py-2 text-[13px] font-semibold text-white transition hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
              >
                Delete video
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getStageDisplayNamesById(items: StageItem[]) {
  // --- Quy tắc hiển thị tên unique ---
  // Suffix (1), (2)... chỉ được thêm khi 2 item có cùng tên VÀ cùng ngày.
  // Trùng tên nhưng khác ngày = 2 lần đo khác nhau, giữ nguyên tên gốc.
  // Key = name + stageDate để match đúng với quy tắc đặt tên bên backend.
  const duplicateCounts = new Map<string, number>();
  const displayNamesById = new Map<string, string>();

  for (const item of items) {
    const nameKey = item.name.trim().toLowerCase();
    if (!nameKey) continue;

    // Scope duplicate check theo name + ngày (null/undefined coi là cùng nhóm)
    const dateKey = item.stageDate ?? '__no_date__';
    const dedupKey = `${nameKey}||${dateKey}`;

    const duplicateIndex = duplicateCounts.get(dedupKey) ?? 0;
    duplicateCounts.set(dedupKey, duplicateIndex + 1);

    const suffix = duplicateIndex > 0 ? ` (${duplicateIndex})` : '';
    displayNamesById.set(item.id, `${formatStageDisplayName(item)}${suffix}`);
  }

  return displayNamesById;
}

function formatStageDisplayName(item: StageItem) {
  return `${item.code}. ${item.name}`;
}
