import { downloadText, formatTime } from "./persistence";
import type {
  ProjectData,
  ReviewShift,
  Segment,
  SegmentSnapshot,
  ShiftChange,
  ChangeDetail,
  TranscriptTrack,
} from "./types";
import { uid } from "./data";

export const SHIFT_KEY = "sologsb-1007-active-shift-v1";
export const HISTORY_KEY = "sologsb-1007-shift-history-v1";
export const LAST_PROOFREADER_KEY = "sologsb-1007-last-proofreader";

/* ----------------------------- localStorage ----------------------------- */

export function loadActiveShift(): ReviewShift | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const shift = JSON.parse(localStorage.getItem(SHIFT_KEY) ?? "") as ReviewShift;
    return shift?.id && shift.active ? shift : null;
  } catch {
    return null;
  }
}

export function persistActiveShift(shift: ReviewShift | null) {
  if (typeof localStorage === "undefined") return;
  try {
    if (shift) localStorage.setItem(SHIFT_KEY, JSON.stringify(shift));
    else localStorage.removeItem(SHIFT_KEY);
  } catch {
    // Quota / private mode failures keep the in-memory shift usable.
  }
}

export function loadShiftHistory(): ReviewShift[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const items = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as ReviewShift[];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export function appendShiftHistory(shift: ReviewShift): ReviewShift[] {
  const history = [shift, ...loadShiftHistory().filter((item) => item.id !== shift.id)];
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 200)));
  } catch {
    // Older entries are dropped first when the quota is tight.
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 40)));
    } catch {
      // Keep working in memory when persistence is unavailable.
    }
  }
  return history;
}

export function saveLastProofreader(name: string) {
  try {
    localStorage.setItem(LAST_PROOFREADER_KEY, name);
  } catch {
    // Best-effort convenience value.
  }
}

export function lastProofreader(): string {
  try {
    return localStorage.getItem(LAST_PROOFREADER_KEY) ?? "";
  } catch {
    return "";
  }
}

/* ------------------------------- snapshots ------------------------------ */

export function snapshotSegment(segment: Segment): SegmentSnapshot {
  return {
    id: segment.id,
    speakerId: segment.speakerId,
    start: segment.start,
    end: segment.end,
    text: segment.text,
    confidence: segment.confidence,
    reviewed: segment.reviewed,
    flags: { ...segment.flags },
    tagIds: [...segment.tagIds],
    commentCount: segment.comments.length,
    unresolvedCount: segment.comments.filter((comment) => !comment.resolved).length,
  };
}

export function snapshotTrack(track: TranscriptTrack): Record<string, SegmentSnapshot> {
  return Object.fromEntries(track.segments.map((segment) => [segment.id, snapshotSegment(segment)]));
}

export function startShift(track: TranscriptTrack, proofreader: string, projectTitle: string): ReviewShift {
  return {
    id: uid("shift"),
    trackId: track.id,
    trackName: track.name,
    proofreader,
    projectTitle,
    startedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    active: true,
    snapshot: snapshotTrack(track),
  };
}

/* --------------------------------- diff --------------------------------- */

const FLAG_LABELS: Array<[keyof Segment["flags"], string]> = [
  ["lowConfidence", "低置信标记"],
  ["dialect", "方言表达标记"],
  ["properNoun", "专有名词标记"],
];

function pushChange(details: ChangeDetail[], changed: boolean, field: string, label: string, before: string, after: string) {
  if (changed) details.push({ field, label, before, after });
}

function describeSegment(segment: { speakerId: string; text: string }, speakers: ProjectData["speakers"]): string {
  const speaker = speakers.find((item) => item.id === segment.speakerId)?.name ?? "未知发言人";
  return `${speaker}：${segment.text}`;
}

/**
 * Compare the shift's frozen snapshot with the current track and return one
 * entry per touched segment. Segments absent from the track are appended at
 * the end (merges/deletions) so nothing disappears from the handoff sheet.
 */
export function computeShiftChanges(shift: ReviewShift, project: ProjectData): ShiftChange[] {
  const track = project.tracks.find((item) => item.id === shift.trackId);
  const changes: ShiftChange[] = [];

  track?.segments.forEach((segment, index) => {
    const before = shift.snapshot[segment.id];
    const ordinal = index + 1;
    if (!before) {
      changes.push({
        segmentId: segment.id,
        ordinal,
        status: "added",
        speakerId: segment.speakerId,
        text: segment.text,
        details: [{ field: "segment", label: "新增片段", before: "（班次开始时不存在）", after: describeSegment(segment, project.speakers) }],
      });
      return;
    }

    const details: ChangeDetail[] = [];
    pushChange(details, before.text !== segment.text, "text", "正文", before.text, segment.text);
    pushChange(
      details,
      before.speakerId !== segment.speakerId,
      "speaker",
      "发言人",
      project.speakers.find((s) => s.id === before.speakerId)?.name ?? before.speakerId,
      project.speakers.find((s) => s.id === segment.speakerId)?.name ?? segment.speakerId,
    );
    pushChange(details, before.start !== segment.start, "start", "开始时间", formatTime(before.start), formatTime(segment.start));
    pushChange(details, before.end !== segment.end, "end", "结束时间", formatTime(before.end), formatTime(segment.end));
    pushChange(
      details,
      before.confidence !== segment.confidence,
      "confidence",
      "置信度",
      `${before.confidence}/5`,
      `${segment.confidence}/5`,
    );
    pushChange(details, before.reviewed !== segment.reviewed, "reviewed", "校对状态", before.reviewed ? "已校对" : "待校对", segment.reviewed ? "已校对" : "待校对");
    for (const [flag, label] of FLAG_LABELS) {
      pushChange(
        details,
        before.flags[flag] !== segment.flags[flag],
        `flags.${flag}`,
        label,
        before.flags[flag] ? "有" : "无",
        segment.flags[flag] ? "有" : "无",
      );
    }
    const beforeTags = before.tagIds.map((id) => project.tags.find((tag) => tag.id === id)?.label ?? id).join("、");
    const afterTags = segment.tagIds.map((id) => project.tags.find((tag) => tag.id === id)?.label ?? id).join("、");
    pushChange(details, beforeTags !== afterTags, "tags", "主题/事件/人物", beforeTags || "（无）", afterTags || "（无）");
    const commentCount = segment.comments.length;
    const unresolvedCount = segment.comments.filter((comment) => !comment.resolved).length;
    pushChange(
      details,
      before.commentCount !== commentCount || before.unresolvedCount !== unresolvedCount,
      "comments",
      "批注",
      `${before.commentCount} 条（未解决 ${before.unresolvedCount}）`,
      `${commentCount} 条（未解决 ${unresolvedCount}）`,
    );

    if (details.length) {
      changes.push({
        segmentId: segment.id,
        ordinal,
        status: "modified",
        speakerId: segment.speakerId,
        text: segment.text,
        details,
      });
    }
  });

  const seen = new Set(track?.segments.map((segment) => segment.id) ?? []);
  let ordinal = (track?.segments.length ?? 0) + 1;
  for (const [id, before] of Object.entries(shift.snapshot)) {
    if (seen.has(id)) continue;
    changes.push({
      segmentId: id,
      ordinal: ordinal++,
      status: "removed",
      speakerId: before.speakerId,
      text: before.text,
      details: [
        {
          field: "segment",
          label: "片段已删除/合并",
          before: describeSegment(before, project.speakers),
          after: "（当前轨道中已不存在）",
        },
      ],
    });
  }

  return changes;
}

/* ------------------------------- handoff -------------------------------- */

export function formatDateTime(iso: string | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export function shiftDuration(shift: ReviewShift): string {
  const end = shift.endedAt ? Date.parse(shift.endedAt) : Date.now();
  const start = Date.parse(shift.startedAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "—";
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

export function buildHandoffText(shift: ReviewShift, project?: ProjectData): string {
  const changes = shift.changes ?? [];
  const order = { added: 0, modified: 1, removed: 2 } as const;
  const statusLabel = (status: ShiftChange["status"]) =>
    status === "added" ? "新增" : status === "removed" ? "删除/合并" : "修改";
  const speakerName = (speakerId: string | null) => {
    if (!speakerId) return "";
    const name = project?.speakers.find((speaker) => speaker.id === speakerId)?.name ?? speakerId;
    return `（${name}）`;
  };

  const lines: string[] = [
    "校订班次交接单",
    "=".repeat(20),
    "",
    `项目：${shift.projectTitle ?? "—"}`,
    `轨道：${shift.trackName}`,
    `校订人：${shift.proofreader}`,
    `开始：${formatDateTime(shift.startedAt)}`,
    `结束：${formatDateTime(shift.endedAt)}`,
    `时长：${shiftDuration(shift)}`,
    `改动片段：${shift.changeCount ?? changes.length} 个`,
    "",
  ];

  if (!changes.length) {
    lines.push("本班次没有留下片段改动。", "");
  } else {
    lines.push("改动明细（旧 → 新）", "-".repeat(20), "");
    const sorted = [...changes].sort(
      (a, b) => order[a.status] - order[b.status] || a.ordinal - b.ordinal,
    );
    for (const change of sorted) {
      lines.push(`[片段 ${change.ordinal}] ${statusLabel(change.status)} ${speakerName(change.speakerId)}${change.text ? `：${change.text}` : ""}`);
      for (const detail of change.details) {
        lines.push(`  · ${detail.label}`);
        lines.push(`    旧：${detail.before}`);
        lines.push(`    新：${detail.after}`);
      }
      lines.push("");
    }
  }

  if (shift.handoffNote?.trim()) {
    lines.push("交接备注", "-".repeat(20), "", shift.handoffNote.trim(), "");
  }

  lines.push(`导出时间：${new Date().toLocaleString()}`);
  return lines.join("\n");
}

export function downloadHandoff(shift: ReviewShift, project?: ProjectData) {
  const stamp = (shift.endedAt ?? shift.startedAt).slice(0, 16).replace(/[:T]/g, "-");
  downloadText(
    `交接单-${shift.trackName}-${shift.proofreader}-${stamp}.txt`,
    buildHandoffText(shift, project),
  );
}
