import { A } from "@solidjs/router";
import { For, Show, createMemo, createSignal } from "solid-js";
import { loadProject } from "../persistence";
import { downloadHandoff, formatDateTime, loadShiftHistory, shiftDuration } from "../shift";
import type { ReviewShift } from "../types";

export default function ShiftHistoryPage() {
  const loaded = loadProject();
  const [history, setHistory] = createSignal<ReviewShift[]>(loadShiftHistory());
  const [trackFilter, setTrackFilter] = createSignal("all");
  const [personFilter, setPersonFilter] = createSignal("all");
  const [openId, setOpenId] = createSignal<string | null>(null);

  const tracks = createMemo(() => loaded.project.tracks);
  const trackName = (shift: ReviewShift) =>
    tracks().find((track) => track.id === shift.trackId)?.name ?? shift.trackName;
  const people = createMemo(() => Array.from(new Set(history().map((shift) => shift.proofreader))));

  const filtered = createMemo(() =>
    history()
      .filter((shift) => trackFilter() === "all" || shift.trackId === trackFilter())
      .filter((shift) => personFilter() === "all" || shift.proofreader === personFilter()),
  );

  const totalChanges = createMemo(() =>
    filtered().reduce((sum, shift) => sum + (shift.changeCount ?? shift.changes?.length ?? 0), 0),
  );

  const reload = () => setHistory(loadShiftHistory());

  return (
    <div class="history-shell">
      <header class="history-topbar">
        <div class="brand-mark" aria-hidden="true"><span>口述</span><b>1007</b></div>
        <div class="history-heading">
          <h1>校订班次历史</h1>
          <span>已结束的班次按校订人与轨道归档，可逐条查看新旧内容并导出交接单。</span>
        </div>
        <div class="history-actions">
          <button class="btn btn-quiet" onClick={reload}>刷新</button>
          <A class="btn btn-primary" href="/">返回编辑器</A>
        </div>
      </header>

      <main class="history-main">
        <section class="history-filters panel-block">
          <label>
            文本轨道
            <select value={trackFilter()} onChange={(event) => setTrackFilter(event.currentTarget.value)}>
              <option value="all">全部轨道（{tracks().length}）</option>
              <For each={tracks()}>
                {(track) => <option value={track.id}>{track.name}</option>}
              </For>
            </select>
          </label>
          <label>
            校订人
            <select value={personFilter()} onChange={(event) => setPersonFilter(event.currentTarget.value)}>
              <option value="all">全部校订人</option>
              <For each={people()}>
                {(person) => <option value={person}>{person}</option>}
              </For>
            </select>
          </label>
          <div class="history-stats">
            <strong>{filtered().length}</strong> 个班次 · 共 <strong>{totalChanges()}</strong> 个改动片段
          </div>
        </section>

        <Show when={filtered().length} fallback={
          <div class="history-empty">
            <b>还没有已结束的校订班次</b>
            <span>在编辑器中开始班次、校对片段后结束班次，记录会出现在这里。</span>
            <A class="btn btn-primary" href="/">去开始一个班次</A>
          </div>
        }>
          <div class="shift-history-list">
            <For each={filtered()}>
              {(shift) => {
                const changes = shift.changes ?? [];
                const open = () => openId() === shift.id;
                return (
                  <article class={`history-card ${open() ? "open" : ""}`}>
                    <button class="history-card-head" onClick={() => setOpenId(open() ? null : shift.id)}>
                      <span class="history-person">{shift.proofreader}</span>
                      <span class="history-track">{trackName(shift)}</span>
                      <span class="history-when">{formatDateTime(shift.endedAt)}</span>
                      <span class="history-count">{shift.changeCount ?? changes.length} 段改动</span>
                      <span class="history-caret">{open() ? "收起 ▲" : "展开 ▼"}</span>
                    </button>
                    <Show when={open()}>
                      <div class="history-detail">
                        <div class="history-meta-row">
                          <span>开始：{formatDateTime(shift.startedAt)}</span>
                          <span>结束：{formatDateTime(shift.endedAt)}</span>
                          <span>时长：{shiftDuration(shift)}</span>
                          <span>项目：{shift.projectTitle ?? "—"}</span>
                        </div>
                        <Show when={shift.handoffNote?.trim()}>
                          <p class="history-note"><b>交接备注</b>{shift.handoffNote!.trim()}</p>
                        </Show>
                        <div class="shift-change-list">
                          <For each={changes} fallback={<div class="mini-empty">本班次没有片段改动。</div>}>
                            {(change) => (
                              <article class={`change-card change-${change.status}`}>
                                <header>
                                  <strong>片段 {change.ordinal}</strong>
                                  <span class={`change-status ${change.status}`}>
                                    {change.status === "added" ? "新增" : change.status === "removed" ? "删除/合并" : "修改"}
                                  </span>
                                  <small>{change.text}</small>
                                </header>
                                <For each={change.details}>
                                  {(detail) => (
                                    <div class="change-detail">
                                      <b>{detail.label}</b>
                                      <p class="old"><span>旧</span>{detail.before || "（空）"}</p>
                                      <p class="new"><span>新</span>{detail.after || "（空）"}</p>
                                    </div>
                                  )}
                                </For>
                              </article>
                            )}
                          </For>
                        </div>
                        <div class="history-detail-actions">
                          <button class="btn btn-primary" onClick={() => downloadHandoff(shift, loaded.project)}>导出交接单 (.txt)</button>
                        </div>
                      </div>
                    </Show>
                  </article>
                );
              }}
            </For>
          </div>
        </Show>
      </main>
    </div>
  );
}
