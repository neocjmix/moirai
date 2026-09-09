// @ts-nocheck -- Next.js adapter: URDR was authored under its own TS config.
"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { GearIcon, GlobeIcon, LockClosedIcon, MagnifyingGlassIcon, ChevronDownIcon } from "@radix-ui/react-icons";
import { graphShellWorkspaceShellSchema, type GraphShellWorkspaceShell } from "@urdr/contracts";

import appShellStyles from "./app-shell.module.css";
import { GraphShell } from "./components/graph-shell";
import { RuntimeErrorBoundary } from "./components/runtime-error-boundary";
import shellStyles from "./components/graph-shell.module.css";
import { DEFAULT_COMPOSITE_SPLINE_TUNING, type CompositeHullMode, type CompositeSplineTuning } from "./components/graph-shell-region-geometry";
import { graphReadLoader, type GraphReadLoader } from "./graph-read-loader";
import {
  readManualAppLocaleOverride,
  resolveBrowserLocale,
  writeManualAppLocaleOverride,
  type AppLocale,
} from "./locale";

type ShellPage = "global" | "private" | "explore" | "settings";

type AppProps = {
  loader?: GraphReadLoader;
  renderGlobalPage?: (args: {
    workspace: GraphShellWorkspaceShell;
    locale: AppLocale;
    compositeHullMode: CompositeHullMode;
    compositeSplineTuning: CompositeSplineTuning;
  }) => ReactNode;
};

const LOADING_WORKSPACE_BUILD_REVISION = "__loading__";

function createLoadingWorkspace(locale: AppLocale): GraphShellWorkspaceShell {
  const isKorean = locale === "ko";

  return {
    menuItems: [{ id: "global", label: isKorean ? "전체" : "Global", active: true }],
    tabs: [],
    canons: [],
    defaultTabId: "loading",
    buildRevision: LOADING_WORKSPACE_BUILD_REVISION,
    chronologyBoard: {
      mode: "gregorian",
      axis: {
        scheme: "gregorian_utc",
        timeSystemId: "time:gregorian-historical",
        compatibilityKey: "gregorian-historical",
        startYear: 1388,
        endYear: 1598,
        tickYears: [1388, 1392, 1498, 1506, 1592, 1598],
      },
      columns: [],
      placements: [],
      unplaced: [],
    },
  };
}

function resolveShellPage(pathname: string): ShellPage {
  if (pathname === "/" || pathname === "/global") {
    return "global";
  }

  if (pathname === "/private") {
    return "private";
  }

  if (pathname === "/explore") {
    return "explore";
  }

  if (pathname === "/settings") {
    return "settings";
  }

  return "global";
}

function getShellPagePath(page: ShellPage) {
  return page === "global" ? "/" : `/${page}`;
}

const SHELL_PAGE_COPY = {
  ko: {
    privateTitle: "프라이빗",
    privateBody: "개인 타임라인과 비공개 작업 공간을 위한 페이지입니다. 곧 실제 기능을 채울 예정입니다.",
    exploreTitle: "탐색",
    exploreBody: "캐논을 넘나드는 탐색과 발견 경험을 위한 페이지입니다. 곧 실제 기능을 채울 예정입니다.",
    settingsTitle: "언어",
    settingsBody: "브라우저 언어를 우선 사용하되, 여기서 수동으로 덮어쓸 수 있습니다.",
    settingsLanguageTitle: "앱 언어",
    settingsLanguageHint: "수동 선택은 셸 상태와 분리되어 저장됩니다.",
    settingsBrowserDefaultLabel: "브라우저 기본값 사용",
    settingsOverrideActiveLabel: "수동 선택 적용 중",
    primarySectionsAriaLabel: "주요 섹션",
    collapseTabBarLabel: "탭바 숨기기",
    expandTabBarLabel: "탭바 펼치기",
  },
  en: {
    privateTitle: "Private",
    privateBody: "A page for personal timelines and private workspaces. Real functionality will land here next.",
    exploreTitle: "Explore",
    exploreBody: "A page for cross-canon discovery and browsing. Real functionality will land here next.",
    settingsTitle: "Language",
    settingsBody: "The app prefers the browser locale, but you can override it here.",
    settingsLanguageTitle: "App language",
    settingsLanguageHint: "The manual override is stored separately from shell state.",
    settingsBrowserDefaultLabel: "Use browser default",
    settingsOverrideActiveLabel: "Manual override active",
    primarySectionsAriaLabel: "Primary sections",
    collapseTabBarLabel: "Collapse tab bar",
    expandTabBarLabel: "Expand tab bar",
  },
} as const;

const APP_SHELL_SECTIONS = [
  { id: "global" as const, label: { ko: "글로벌", en: "Global" }, icon: GlobeIcon },
  { id: "private" as const, label: { ko: "프라이빗", en: "Private" }, icon: LockClosedIcon },
  { id: "explore" as const, label: { ko: "탐색", en: "Explore" }, icon: MagnifyingGlassIcon },
  { id: "settings" as const, label: { ko: "설정", en: "Settings" }, icon: GearIcon },
];

export function App({ loader = graphReadLoader, renderGlobalPage }: AppProps = {}) {
  const compositeHullMode: CompositeHullMode = "concave";
  const compositeSplineTuning: CompositeSplineTuning = DEFAULT_COMPOSITE_SPLINE_TUNING;
  const [manualLocaleOverride, setManualLocaleOverride] = useState<AppLocale | null>(() => readManualAppLocaleOverride());
  const [activePage, setActivePage] = useState<ShellPage>(() =>
    resolveShellPage(typeof window === "undefined" ? "/graph" : window.location.pathname)
  );
  const [tabBarCollapsed, setTabBarCollapsed] = useState(false);
  const browserLocale = useMemo(
    () =>
      resolveBrowserLocale(
        typeof window === "undefined"
          ? undefined
          : window.navigator.languages?.length
            ? window.navigator.languages
            : [window.navigator.language],
      ),
    [],
  );
  const locale = manualLocaleOverride ?? browserLocale;
  const copy = SHELL_PAGE_COPY[locale];
  const loadingWorkspace = useMemo(() => createLoadingWorkspace(locale), [locale]);
  const [workspace, setWorkspace] = useState<GraphShellWorkspaceShell | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const graphWorkspace = workspace ?? (workspaceStatus === "loading" && !renderGlobalPage ? loadingWorkspace : null);
  const GlobalPageContent = () =>
    graphWorkspace ? renderGlobalPage ? (
      <>{renderGlobalPage({ workspace: graphWorkspace, locale, compositeHullMode, compositeSplineTuning })}</>
    ) : (
      <GraphShell
        initialWorkspace={graphWorkspace}
        compositeHullMode={compositeHullMode}
        compositeSplineTuning={compositeSplineTuning}
        loader={loader}
        locale={locale}
      />
    ) : null;

  useEffect(() => {
    setWorkspaceStatus("loading");
    setWorkspace(null);

    const abortController = new AbortController();
    let active = true;

    const loadWorkspace = async () => {
      try {
        const parsed = graphShellWorkspaceShellSchema.parse(await loader.loadWorkspace(locale));
        if (active) {
          setWorkspace(parsed);
          setWorkspaceStatus("ready");
        }
      } catch (error) {
        if (!active || abortController.signal.aborted) {
          return;
        }
        setWorkspace(null);
        setWorkspaceStatus("unavailable");
      }
    };

    void loadWorkspace();

    return () => {
      active = false;
      abortController.abort();
    };
  }, [loader, locale]);

  useEffect(() => {
    writeManualAppLocaleOverride(manualLocaleOverride);
  }, [manualLocaleOverride]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const handlePopState = () => {
      setActivePage(resolveShellPage(window.location.pathname));
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleNavigate = useCallback((page: ShellPage) => {
    const nextPath = getShellPagePath(page);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    setActivePage(page);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const namespace = window._URDR_ ?? {};
    namespace.toggleHud = () => {
      const nextPage = activePage === "settings" ? "global" : "settings";
      handleNavigate(nextPage);
      return nextPage === "settings";
    };
    namespace.showHud = () => {
      handleNavigate("settings");
      return true;
    };
    namespace.hideHud = () => {
      handleNavigate("global");
      return false;
    };
    namespace.isHudVisible = () => activePage === "settings";
    window._URDR_ = namespace;

    return () => {
      if (window._URDR_ === namespace) {
        delete namespace.toggleHud;
        delete namespace.showHud;
        delete namespace.hideHud;
        delete namespace.isHudVisible;
      }
    };
  }, [activePage, handleNavigate]);

  const renderPage = () => {
    if (activePage === "global") {
      if (workspaceStatus === "unavailable") {
        return (
          <div className={appShellStyles.shellPage}>
            <div className={appShellStyles.shellPageSurface}>
              <div className={appShellStyles.shellSectionTitle}>{locale === "ko" ? "그래프를 불러올 수 없습니다" : "Graph unavailable"}</div>
              <div className={appShellStyles.shellSectionBody}>
                {locale === "ko"
                  ? "현재 프로젝션 데이터를 사용할 수 없습니다. API 또는 프로젝션 런타임 상태를 확인해주세요."
                  : "Projection data is currently unavailable. Check the API or projection runtime state."}
              </div>
            </div>
          </div>
        );
      }

      return (
        <RuntimeErrorBoundary
          onError={(error) => {
            console.error("[graph-page:error]", error);
          }}
          resetKeys={[activePage, locale, compositeHullMode]}
          fallback={({ error, reset }) => (
            <div className={appShellStyles.shellPage}>
              <div className={appShellStyles.shellPageSurface}>
                <div className={appShellStyles.shellSectionTitle}>{locale === "ko" ? "그래프 페이지 오류" : "Graph page error"}</div>
                <div className={appShellStyles.shellSectionBody}>
                  {locale === "ko"
                    ? "그래프 렌더링 중 문제가 발생했습니다. 아래 버튼으로 다시 시도하거나 다른 탭으로 이동할 수 있습니다."
                    : "The graph page failed while rendering. You can retry below or navigate to another tab."}
                </div>
                <div className={appShellStyles.shellLanguageStatus}>{error?.message ?? "Unknown graph error"}</div>
                <button className={appShellStyles.shellSecondaryButton} onClick={reset} type="button">
                  {locale === "ko" ? "그래프 다시 시도" : "Retry graph"}
                </button>
              </div>
            </div>
          )}
        >
          <GlobalPageContent />
        </RuntimeErrorBoundary>
      );
    }

    if (activePage === "settings") {
      return (
        <div className={appShellStyles.shellPage}>
          <div className={appShellStyles.shellPageSurface}>
            <div className={appShellStyles.shellSectionTitle}>{copy.settingsTitle}</div>
            <div className={appShellStyles.shellSectionBody}>{copy.settingsBody}</div>
            <div className={appShellStyles.shellLanguagePanel}>
              <div className={appShellStyles.shellLanguageHeader}>{copy.settingsLanguageTitle}</div>
              <div className={appShellStyles.shellLanguageHint}>{copy.settingsLanguageHint}</div>
              <div className={appShellStyles.shellLanguageActions}>
                <button
                  aria-pressed={manualLocaleOverride === "ko"}
                  className={`${shellStyles.timelineOptionButton} ${manualLocaleOverride === "ko" ? shellStyles.timelineOptionButtonActive : ""}`}
                  onClick={() => setManualLocaleOverride("ko")}
                  type="button"
                >
                  <span className={shellStyles.timelineOptionLabel}>한국어</span>
                </button>
                <button
                  aria-pressed={manualLocaleOverride === "en"}
                  className={`${shellStyles.timelineOptionButton} ${manualLocaleOverride === "en" ? shellStyles.timelineOptionButtonActive : ""}`}
                  onClick={() => setManualLocaleOverride("en")}
                  type="button"
                >
                  <span className={shellStyles.timelineOptionLabel}>English</span>
                </button>
                <button
                  aria-pressed={manualLocaleOverride === null}
                  className={`${shellStyles.timelineOptionButton} ${manualLocaleOverride === null ? shellStyles.timelineOptionButtonActive : ""}`}
                  onClick={() => setManualLocaleOverride(null)}
                  type="button"
                >
                  <span className={shellStyles.timelineOptionLabel}>{copy.settingsBrowserDefaultLabel}</span>
                </button>
              </div>
              <div className={appShellStyles.shellLanguageStatus}>
                {manualLocaleOverride === null ? `${copy.settingsBrowserDefaultLabel}: ${locale}` : `${copy.settingsOverrideActiveLabel}: ${manualLocaleOverride}`}
              </div>
            </div>
          </div>
        </div>
      );
    }

    const title = activePage === "private" ? copy.privateTitle : copy.exploreTitle;
    const body = activePage === "private" ? copy.privateBody : copy.exploreBody;

    return (
      <div className={appShellStyles.shellPage}>
        <div className={appShellStyles.shellPageSurface}>
          <div className={appShellStyles.shellSectionTitle}>{title}</div>
          <div className={appShellStyles.shellSectionBody}>{body}</div>
        </div>
      </div>
    );
  };

  return (
    <div className={appShellStyles.shell}>
      <div className={appShellStyles.body}>{renderPage()}</div>

      <div className={appShellStyles.bottomTabDock} data-collapsed={tabBarCollapsed ? "true" : "false"}>
        <div className={appShellStyles.bottomTabRail}>
          <button
            aria-label={tabBarCollapsed ? copy.expandTabBarLabel : copy.collapseTabBarLabel}
            className={appShellStyles.bottomTabCollapseButton}
            onClick={() => setTabBarCollapsed((current) => !current)}
            type="button"
          >
            <ChevronDownIcon />
          </button>

          <nav aria-hidden={tabBarCollapsed} aria-label={copy.primarySectionsAriaLabel} className={appShellStyles.bottomTabBar}>
            {APP_SHELL_SECTIONS.map((section) => {
              const SectionIcon = section.icon;
              const active = section.id === activePage;

              return (
                <button
                  aria-label={section.label[locale]}
                  aria-pressed={active}
                  className={`${appShellStyles.bottomTabButton} ${active ? appShellStyles.bottomTabButtonActive : ""}`}
                  key={section.id}
                  onClick={() => handleNavigate(section.id)}
                  tabIndex={tabBarCollapsed ? -1 : 0}
                  type="button"
                >
                  <SectionIcon />
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}
