import { formatTime } from "./persistence";
import type { ProjectData, Segment, ShiftChange, ShiftRecord, Speaker, Tag } from "./types";

export function segmentsEqual(a: Segment, b: Segment): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function summarizeChange(before: Segment, after: Segment, speakers: Speaker[], tags: Tag[]): string[] {
  const speakerName = (id: string) => speakers.find((speaker) => speaker.id === id)?.name ?? "未知";
  const tagLabel = (id: string) => tags.find((tag) => tag.id === id)?.label ?? id;
  const parts: string[] = [];
  if (before.text !== after.text) parts.push("文本");
  if (before.speakerId !== after.speakerId) {
    parts.push(`发言人 ${speakerName(before.speakerId)}→${speakerName(after.speakerId)}`);
  }
  if (before.confidence !== after.confidence) parts.push(`置信度 ${before.confidence}→${after.confidence}`);
  if (before.start !== after.start || before.end !== after.end) parts.push("时间码");
  if (before.reviewed !== after.reviewed) parts.push(after.reviewed ? "标记已校对" : "取消已校对");
  if (JSON.stringify(before.flags) !== JSON.stringify(after.flags)) parts.push("校对标记");
  const beforeTags = [...before.tagIds].sort();
  const afterTags = [...after.tagIds].sort();
  if (JSON.stringify(beforeTags) !== JSON.stringify(afterTags)) {
    const added = afterTags.filter((id) => !beforeTags.includes(id)).map(tagLabel);
    const removed = beforeTags.filter((id) => !afterTags.includes(id)).map(tagLabel);
    const detail = [...added.map((label) => `+${label}`), ...removed.map((label) => `-${label}`)].join(" ");
    parts.push(detail ? `关联实体 ${detail}` : "关联实体");
  }
  if (before.comments.length !== after.comments.length) {
    parts.push(`批注 ${before.comments.length}→${after.comments.length}`);
  } else if (JSON.stringify(before.comments) !== JSON.stringify(after.comments)) {
    parts.push("批注更新");
  }
  return parts.length ? parts : ["内容更新"];
}

export function diffSegments(
  snapshot: Segment[],
  current: Segment[],
  speakers: Speaker[],
  tags: Tag[],
): ShiftChange[] {
  const beforeById = new Map(snapshot.map((segment) => [segment.id, segment]));
  const afterById = new Map(current.map((segment) => [segment.id, segment]));
  const changes: ShiftChange[] = [];
  for (const after of current) {
    const before = beforeById.get(after.id);
    if (!before) {
      changes.push({
        segmentId: after.id,
        kind: "added",
        before: null,
        after: structuredClone(after),
        summary: ["新增片段"],
      });
    } else if (!segmentsEqual(before, after)) {
      changes.push({
        segmentId: after.id,
        kind: "modified",
        before: structuredClone(before),
        after: structuredClone(after),
        summary: summarizeChange(before, after, speakers, tags),
      });
    }
  }
  for (const before of snapshot) {
    if (!afterById.has(before.id)) {
      changes.push({
        segmentId: before.id,
        kind: "removed",
        before: structuredClone(before),
        after: null,
        summary: ["删除片段"],
      });
    }
  }
  return changes;
}

export function renderHandoff(project: ProjectData, record: ShiftRecord): string {
  const speakerName = (id: string) => project.speakers.find((speaker) => speaker.id === id)?.name ?? "未知";
  const lines = [
    "# 校订交接单",
    "",
    `- 项目：${project.title}（${project.interviewee} · ${project.recordingDate}）`,
    `- 轨道：${record.trackName}`,
    `- 校订人：${record.reviewer}`,
    `- 班次：${new Date(record.startedAt).toLocaleString()} — ${new Date(record.endedAt).toLocaleString()}`,
    `- 改动片段：${record.changes.length} 段`,
    "",
    "## 改动明细",
    "",
  ];
  record.changes.forEach((change, index) => {
    const anchor = (change.after ?? change.before)!;
    const kindLabel = change.kind === "added" ? "新增" : change.kind === "removed" ? "删除" : "修改";
    lines.push(
      `### ${index + 1}. [${formatTime(anchor.start, false)}–${formatTime(anchor.end, false)}] ${speakerName(anchor.speakerId)}（${kindLabel}）`,
    );
    if (change.before) lines.push(`- 旧：${change.before.text}`);
    if (change.after) lines.push(`- 新：${change.after.text}`);
    lines.push(`- 字段：${change.summary.join("；")}`, "");
  });
  if (!record.changes.length) lines.push("（本班次无改动）");
  return lines.join("\n");
}
