import { For, Show } from "solid-js";
import { formatTime } from "../persistence";
import type { ShiftChange, Speaker } from "../types";

const kindLabel = (kind: ShiftChange["kind"]) =>
  kind === "added" ? "新增" : kind === "removed" ? "删除" : "修改";

export function ShiftChangeList(props: { changes: ShiftChange[]; speakers: Speaker[]; empty: string }) {
  const speakerName = (id: string) => props.speakers.find((speaker) => speaker.id === id)?.name ?? "未知发言人";
  return (
    <div class="change-list">
      <For each={props.changes} fallback={<div class="mini-empty">{props.empty}</div>}>
        {(change) => {
          const anchor = () => (change.after ?? change.before)!;
          return (
            <article class={`change-card ${change.kind}`}>
              <header>
                <span class={`change-kind ${change.kind}`}>{kindLabel(change.kind)}</span>
                <span class="change-time">
                  {formatTime(anchor().start, false)}–{formatTime(anchor().end, false)}
                </span>
                <b>{speakerName(anchor().speakerId)}</b>
              </header>
              <Show when={change.before}>
                {(before) => (
                  <div class="diff-row old">
                    <span class="diff-label">旧</span>
                    <p>{before().text}</p>
                  </div>
                )}
              </Show>
              <Show when={change.after}>
                {(after) => (
                  <div class="diff-row new">
                    <span class="diff-label">新</span>
                    <p>{after().text}</p>
                  </div>
                )}
              </Show>
              <div class="change-summary">{change.summary.join(" · ")}</div>
            </article>
          );
        }}
      </For>
    </div>
  );
}
