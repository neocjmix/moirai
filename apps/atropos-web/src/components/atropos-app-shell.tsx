"use client";

import {
  ChevronDownIcon,
  GearIcon,
  GlobeIcon,
  LockClosedIcon,
  MagnifyingGlassIcon
} from "@radix-ui/react-icons";
import { useCallback, useEffect, useState } from "react";

import {
  ATROPOS_PRIMARY_SCREENS,
  getAtroposScreen,
  resolveAtroposScreen,
  type AtroposScreenId
} from "../lib/atropos-screen-registry";
import {
  readManualAppLocaleOverride,
  resolveBrowserLocale,
  writeManualAppLocaleOverride,
  type AppLocale
} from "../urdr-port/src/locale";
import shellControls from "../urdr-port/src/components/graph-shell.module.css";
import styles from "../urdr-port/src/app-shell.module.css";
import { GraphSourceIsland } from "./graph-source-island";
import { MoiraiGraphCanvas } from "./moirai-graph-canvas";

const ICONS = {
  graph: GlobeIcon,
  private: LockClosedIcon,
  explore: MagnifyingGlassIcon,
  settings: GearIcon
} as const;

const COPY = {
  ko: {
    privateTitle: "프라이빗",
    privateBody:
      "개인 데이터 영역의 진입점입니다. 비공개 Publication과 권한 모델이 승인되기 전에는 사용할 수 없습니다.",
    exploreTitle: "탐색",
    exploreBody:
      "그래프와 별개인 발견 화면의 자리입니다. 현재 릴리스에서는 사용할 수 없습니다.",
    unavailable: "준비 중 · 현재 사용할 수 없음",
    settingsTitle: "언어",
    settingsBody: "브라우저 언어를 우선 사용하되 여기서 덮어쓸 수 있습니다.",
    browserDefault: "브라우저 기본값 사용",
    primarySections: "주요 섹션",
    collapse: "탭바 숨기기",
    expand: "탭바 펼치기"
  },
  en: {
    privateTitle: "Private",
    privateBody:
      "This entry point remains unavailable until private Publication and access rules are approved.",
    exploreTitle: "Explore",
    exploreBody: "Discovery outside the graph is unavailable in this release.",
    unavailable: "Planned · currently unavailable",
    settingsTitle: "Language",
    settingsBody:
      "The browser locale is preferred, with a manual override here.",
    browserDefault: "Use browser default",
    primarySections: "Primary sections",
    collapse: "Collapse tab bar",
    expand: "Expand tab bar"
  }
} as const;

function UnavailableScreen({
  title,
  body,
  status
}: Readonly<{ title: string; body: string; status: string }>) {
  return (
    <div className={styles.shellPage}>
      <div className={styles.shellPageSurface}>
        <div className={styles.shellUnavailableStatus} role="status">
          {status}
        </div>
        <div className={styles.shellSectionTitle}>{title}</div>
        <div className={styles.shellSectionBody}>{body}</div>
      </div>
    </div>
  );
}

export function AtroposAppShell({
  initialScreen = "graph"
}: Readonly<{ initialScreen?: AtroposScreenId }>) {
  const [manualLocale, setManualLocale] = useState<AppLocale | null>(null);
  const [browserLocale, setBrowserLocale] = useState<AppLocale>("ko");
  const [localeLoaded, setLocaleLoaded] = useState(false);
  const [activePage, setActivePage] = useState(initialScreen);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const locale = manualLocale ?? browserLocale;
  const copy = COPY[locale];

  useEffect(() => {
    setManualLocale(readManualAppLocaleOverride());
    setBrowserLocale(
      resolveBrowserLocale(
        window.navigator.languages?.length
          ? window.navigator.languages
          : [window.navigator.language]
      )
    );
    setLocaleLoaded(true);
  }, []);
  useEffect(() => {
    if (localeLoaded) writeManualAppLocaleOverride(manualLocale);
  }, [localeLoaded, manualLocale]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    const restore = () =>
      setActivePage(resolveAtroposScreen(window.location.pathname) ?? "graph");
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  const navigate = useCallback((screen: AtroposScreenId) => {
    const path = getAtroposScreen(screen).path;
    if (window.location.pathname !== path)
      window.history.pushState(
        {},
        "",
        `${path}${window.location.search}${window.location.hash}`
      );
    setActivePage(screen);
  }, []);

  const content =
    activePage === "graph" ? (
      <>
        <GraphSourceIsland locale={locale} />
        <MoiraiGraphCanvas locale={locale} />
      </>
    ) : activePage === "settings" ? (
      <div className={styles.shellPage}>
        <div className={styles.shellPageSurface}>
          <div className={styles.shellSectionTitle}>{copy.settingsTitle}</div>
          <div className={styles.shellSectionBody}>{copy.settingsBody}</div>
          <div className={styles.shellLanguageActions}>
            {(["ko", "en"] as const).map((value) => (
              <button
                aria-pressed={manualLocale === value}
                className={`${shellControls.timelineOptionButton} ${manualLocale === value ? shellControls.timelineOptionButtonActive : ""}`}
                key={value}
                onClick={() => setManualLocale(value)}
                type="button"
              >
                <span className={shellControls.timelineOptionLabel}>
                  {value === "ko" ? "한국어" : "English"}
                </span>
              </button>
            ))}
            <button
              aria-pressed={manualLocale === null}
              className={`${shellControls.timelineOptionButton} ${manualLocale === null ? shellControls.timelineOptionButtonActive : ""}`}
              onClick={() => setManualLocale(null)}
              type="button"
            >
              <span className={shellControls.timelineOptionLabel}>
                {copy.browserDefault}
              </span>
            </button>
          </div>
        </div>
      </div>
    ) : (
      <UnavailableScreen
        body={activePage === "private" ? copy.privateBody : copy.exploreBody}
        status={copy.unavailable}
        title={activePage === "private" ? copy.privateTitle : copy.exploreTitle}
      />
    );

  return (
    <div className={styles.shell}>
      <div className={styles.body}>{content}</div>
      <div
        className={styles.bottomTabDock}
        data-collapsed={dockCollapsed ? "true" : "false"}
      >
        <div className={styles.bottomTabRail}>
          <button
            aria-label={dockCollapsed ? copy.expand : copy.collapse}
            className={styles.bottomTabCollapseButton}
            onClick={() => setDockCollapsed((current) => !current)}
            type="button"
          >
            <ChevronDownIcon />
          </button>
          <nav
            aria-hidden={dockCollapsed}
            aria-label={copy.primarySections}
            className={styles.bottomTabBar}
          >
            {ATROPOS_PRIMARY_SCREENS.map((screen) => {
              const Icon = ICONS[screen.id];
              const active = screen.id === activePage;
              return (
                <button
                  aria-current={active ? "page" : undefined}
                  aria-label={screen.label[locale]}
                  aria-pressed={active}
                  className={`${styles.bottomTabButton} ${active ? styles.bottomTabButtonActive : ""}`}
                  key={screen.id}
                  onClick={() => navigate(screen.id)}
                  tabIndex={dockCollapsed ? -1 : 0}
                  type="button"
                >
                  <Icon />
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}
