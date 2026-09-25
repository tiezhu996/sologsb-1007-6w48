export type Confidence = 1 | 2 | 3 | 4 | 5;

export interface Reply {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface ReviewComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  resolved: boolean;
  replies: Reply[];
}

export interface Speaker {
  id: string;
  name: string;
  role: string;
  color: string;
}

export interface Tag {
  id: string;
  label: string;
  type: "topic" | "event" | "person";
  color: string;
}

export interface Segment {
  id: string;
  start: number;
  end: number;
  speakerId: string;
  text: string;
  confidence: Confidence;
  reviewed: boolean;
  flags: {
    lowConfidence: boolean;
    dialect: boolean;
    properNoun: boolean;
  };
  tagIds: string[];
  comments: ReviewComment[];
}

export interface TranscriptTrack {
  id: string;
  name: string;
  language: string;
  status: "待校对" | "校对中" | "已完成";
  segments: Segment[];
}

export interface ProjectData {
  id: string;
  title: string;
  interviewee: string;
  recordingDate: string;
  activeTrackId: string;
  speakers: Speaker[];
  tags: Tag[];
  tracks: TranscriptTrack[];
  updatedAt: string;
}

export interface PersistedEnvelope {
  schema: 1;
  revision: number;
  tabId: string;
  savedAt: number;
  project: ProjectData;
  /** Set when this save finalizes a review shift, so other tabs show the handoff conflict instead of a generic one. */
  shiftEnd?: {
    id: string;
    proofreader: string;
    trackName: string;
    changeCount: number;
  };
}

export interface SegmentSnapshot {
  id: string;
  speakerId: string;
  start: number;
  end: number;
  text: string;
  confidence: Confidence;
  reviewed: boolean;
  flags: Segment["flags"];
  tagIds: string[];
  commentCount: number;
  unresolvedCount: number;
}

export interface ChangeDetail {
  field: string;
  label: string;
  before: string;
  after: string;
}

export interface ShiftChange {
  segmentId: string;
  ordinal: number;
  status: "added" | "removed" | "modified";
  speakerId: string | null;
  text: string;
  details: ChangeDetail[];
}

export interface ReviewShift {
  id: string;
  trackId: string;
  trackName: string;
  proofreader: string;
  projectTitle?: string;
  startedAt: string;
  lastSeenAt?: string;
  endedAt?: string;
  active: boolean;
  snapshot: Record<string, SegmentSnapshot>;
  changes?: ShiftChange[];
  changeCount?: number;
  handoffNote?: string;
}

export interface ShiftSyncMessage {
  kind: "shift-started" | "shift-ended";
  tabId: string;
  savedAt: number;
  shift: ReviewShift;
  envelope?: PersistedEnvelope;
}

/** Lightweight notice shown on the tab whose shift was ended elsewhere. */
export interface ShiftEndNotice {
  tabId: string;
  savedAt: number;
  shiftId: string;
  proofreader: string;
  trackName: string;
  changeCount: number;
  envelope?: PersistedEnvelope;
}
