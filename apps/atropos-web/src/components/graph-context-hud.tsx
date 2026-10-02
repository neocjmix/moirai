"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useGraphQuery } from "./graph-query-context";
import type { AppLocale } from "../urdr-port/src/locale";
import styles from "./graph-context-hud.module.css";

/** S1 orientation and a manual escape. Inference/pins arrive in later slices. */
function GraphContextHudContent({
  locale,
  topic
}: Readonly<{
  locale: AppLocale;
  topic: { id: string; label: string } | null;
}>) {
  const { catalog, state, setState } = useGraphQuery();
  const world = catalog.worlds[0];
  const ko = locale === "ko";
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = state.query.sources.flatMap((source) => source.canon_ids);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else if (dialog.current?.open) dialog.current.close();
  }, [open]);
  if (!world) return null;
  const change = (ids: string[]) =>
    setState((current) => ({
      ...current,
      query: {
        ...current.query,
        sources: current.query.sources.map((source) => ({
          ...source,
          canon_ids: ids
        }))
      }
    }));
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const matches = world.canons.filter((item) =>
    item.label[locale]
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase().trim())
  );
  return (
    <>
      <div className={styles.hud} data-testid="graph-context-hud">
        <div className={styles.world}>{world.label[locale]}</div>
        {topic ? (
          <div
            className={styles.topic}
            data-testid="graph-context-topic"
            data-event-id={topic.id}
          >
            {topic.label}
          </div>
        ) : null}
      </div>
      <button
        ref={trigger}
        className={styles.trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {ko ? "컬렉션" : "Collections"} <span>{selected.length}</span>
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="collection-browser-title"
        onCancel={close}
        onClose={close}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className={styles.body}>
          <header>
            <h2 id="collection-browser-title">
              {ko ? "컬렉션" : "Collections"}
            </h2>
            <button type="button" onClick={close}>
              {ko ? "닫기" : "Close"}
            </button>
          </header>
          <p className={styles.time}>{catalog.frames[0]?.label[locale]}</p>
          <input
            type="search"
            aria-label={ko ? "컬렉션 검색" : "Search collections"}
            placeholder={ko ? "컬렉션 검색" : "Search collections"}
            value={search}
            onChange={(event) => setSearch(event.target.value.slice(0, 512))}
          />
          <div className={styles.actions}>
            <span>
              {ko ? `${selected.length}개 활성` : `${selected.length} active`}
            </span>
            <button type="button" onClick={() => change([])}>
              {ko ? "모두 끄기" : "Turn all off"}
            </button>
          </div>
          <div className={styles.list}>
            {matches.map((item) => (
              <div key={item.id} className={styles.row}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    onChange={(event) =>
                      change(
                        event.target.checked
                          ? [...selected, item.id]
                          : selected.filter((id) => id !== item.id)
                      )
                    }
                  />
                  {item.label[locale]}
                </label>
                <button
                  type="button"
                  aria-label={`${item.label[locale]} ${ko ? "설명" : "details"}`}
                  onClick={() => {
                    setState((current) => ({
                      ...current,
                      focus: {
                        kind: "event",
                        world_id: world.id,
                        served_revision: world.servedRevision,
                        canon_id: item.id,
                        event_ref: {
                          kind: "event",
                          event_id: `collection:${item.id}`
                        }
                      }
                    }));
                    close();
                  }}
                >
                  {ko ? "읽기" : "Read"}
                </button>
              </div>
            ))}
            {!matches.length ? (
              <p>
                {ko
                  ? "일치하는 컬렉션이 없습니다."
                  : "No matching collections."}
              </p>
            ) : null}
          </div>
        </div>
      </dialog>
    </>
  );
}

export const GraphContextHud = memo(
  GraphContextHudContent,
  (previous, next) =>
    previous.locale === next.locale &&
    previous.topic?.id === next.topic?.id &&
    previous.topic?.label === next.topic?.label
);
