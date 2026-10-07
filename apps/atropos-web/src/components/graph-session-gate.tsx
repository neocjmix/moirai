"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  graphEntryResumeHref,
  graphSessionStorage,
  lastGraphWorld,
  rememberGraphWorld
} from "../lib/graph-session-state";

/** Resolve the entry World before mounting its camera or storing new state. */
export function GraphSessionGate({
  worldId,
  title,
  children
}: {
  worldId?: string;
  title: string;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const storage = graphSessionStorage();
    const target = window.location.pathname.startsWith("/graph/events/")
      ? null
      : graphEntryResumeHref(
          window.location.search,
          lastGraphWorld(storage),
          worldId
        );
    if (target) {
      window.location.replace(target);
      return;
    }
    const remember = () => {
      if (worldId) rememberGraphWorld(storage, worldId);
    };
    const rememberWhenVisible = () => {
      if (document.visibilityState === "visible") remember();
    };
    remember();
    setReady(true);
    window.addEventListener("pageshow", remember);
    document.addEventListener("visibilitychange", rememberWhenVisible);
    return () => {
      window.removeEventListener("pageshow", remember);
      document.removeEventListener("visibilitychange", rememberWhenVisible);
    };
  }, [worldId]);
  return ready ? (
    children
  ) : (
    <main className="graph-resuming" aria-busy="true">
      <p>{title}</p>
      <p role="status">화면을 불러오는 중입니다.</p>
      <a href="/worlds">월드 선택</a>
    </main>
  );
}

export function ResumeLastGraphWorld() {
  useEffect(() => {
    const target = graphEntryResumeHref(
      window.location.search,
      lastGraphWorld(graphSessionStorage())
    );
    window.location.replace(target ?? "/worlds");
  }, []);
  return (
    <main className="graph-resuming">
      <p role="status">마지막 화면을 불러오는 중입니다.</p>
      <a href="/worlds">월드 선택</a>
    </main>
  );
}
