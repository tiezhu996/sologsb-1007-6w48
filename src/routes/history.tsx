import { A } from "@solidjs/router";
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { ShiftChangeList } from "../components/ShiftChanges";
import { STORAGE_KEY, downloadText, loadProject } from "../persistence";
import { renderHandoff } from "../shifts";
import type { ProjectData } from "../types";

export default function ShiftHistoryPage() {
  const [project, setProject] = createSignal<ProjectData | null>(null);
  const [trackFilter, setTrackFilter] = createSignal("all");
  const [reviewerFilter, setReviewerFilter] = createSignal("all");

  onMount(() => {
    const reload = () => setProject(loadProject().project);
    reload();
    // Pick up shifts finished in other tabs without a manual refresh.
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) reload();
    };
    window.addEventListener("storage", handleStorage);
    onCleanup(() => window.removeEventListener("storage", handleStorage));
  });

  const history = createMemo(() => project()?.history ?? []);
  const trackOptions = createMemo(() => {
    const seen = new Map<string, string>();
    for (const record of history()) if (!seen.has(record.trackId)) seen.set(record.trackId, record.trackName);
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  });
  const reviewerOptions = createMemo(() => [...new Set(history().map((record) => record.reviewer))]);
  const filtered = createMemo(() =>
    history().filter((record) =>
      (trackFilter() === "all" || record.trackId === trackFilter()) &&
      (reviewerFilter() === "all" || record.reviewer === reviewerFilter()),
    ),
  );

  return (
    <div class="app-shell history-shell">
      <header class="topbar">
        <div class="brand-mark" aria-hidden="true"><span>口述</span><b>1007</b></div>
        <div class="project-heading">
          <div class="history-title">校订历史</div>
          <div class="project-meta">
            <span>{project()?.title ?? "载入中…"}</span>
            <span>{history().length} 个已结束班次</span>
          </div>
        </div>
        <div class="top-actions">
          <A class="btn btn-quiet" href="/">← 返回编辑器</A>
        </div>
      </header>

      <div class="history-body">
        <div class="history-filters">
          <label>
            轨道
            <select value={trackFilter()} onChange={(event) => setTrackFilter(event.currentTarget.value)}>
              <option value="all">全部轨道</option>
              <For each={trackOptions()}>
                {(track) => <option value={track.id}>{track.name}</option>}
              </For>
            </select>
          </label>
          <label>
            校订人
            <select value={reviewerFilter()} onChange={(event) => setReviewerFilter(event.currentTarget.value)}>
              <option value="all">全部校订人</option>
              <For each={reviewerOptions()}>
                {(name) => <option value={name}>{name}</option>}
              </For>
            </select>
          </label>
          <span class="history-count">{filtered().length} 条记录</span>
        </div>

        <For
          each={filtered()}
          fallback={
            <div class="empty-state history-empty">
              <b>{history().length ? "没有符合筛选条件的班次" : "还没有已结束的校订班次"}</b>
              <span>在编辑器左栏登记校订人并开始班次，结束确认后会写入这里。</span>
            </div>
          }
        >
          {(record) => (
            <section class="record-card">
              <header class="record-head">
                <div class="record-who">
                  <strong>{record.reviewer}</strong>
                  <span class="record-track">{record.trackName}</span>
                </div>
                <div class="record-meta">
                  <span>{new Date(record.startedAt).toLocaleString()} — {new Date(record.endedAt).toLocaleString()}</span>
                  <span class="record-count">{record.changes.length} 段改动</span>
                  <button
                    class="btn btn-quiet"
                    onClick={() => {
                      const data = project();
                      if (!data) return;
                      downloadText(
                        `交接单-${record.trackName}-${record.reviewer}-${record.endedAt.slice(0, 10)}.md`,
                        renderHandoff(data, record),
                        "text/markdown;charset=utf-8",
                      );
                    }}
                  >
                    导出交接单
                  </button>
                </div>
              </header>
              <ShiftChangeList
                changes={record.changes}
                speakers={project()?.speakers ?? []}
                empty="该班次没有片段改动。"
              />
            </section>
          )}
        </For>
      </div>
    </div>
  );
}
