import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CHANNEL_WALLPAPER_URL,
  CHANNEL_WALLPAPER_PREVIEW_URL,
  CHANNEL_WALLPAPER_UNDO_URL,
} from "../config";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiFetchJson, describeApiError, UPLOAD_TIMEOUT_MS } from "../api/client";
import type { PreviewRow, WallpaperRun } from "../api/types";
import {
  Button,
  Canvas,
  Checkbox,
  ConfirmDialog,
  DataTable,
  Dock,
  FieldError,
  FileButton,
  InspectorSection,
  LoadingState,
  Panel,
  PropertyRow,
  RequestError,
  Select,
  Spinner,
  StateTile,
  StatusGlyph,
  StudioInspector,
  TextField,
  ToolbarButton,
  UploadInput,
  useToast,
  type DataColumn,
} from "../design";
import { imageFileError } from "../api/image-file";
import ChannelTreePreview from "./ChannelTreePreview";
import { ChannelTreeRow } from "./ChannelTreeRow";
import { BANNER_HEIGHT, BANNER_WIDTH } from "./bannerExport";
import { TEAMSPEAK_GEOMETRY } from "./teamspeakGeometry";
import { usePreviewOverlay } from "../preview/PreviewOverlayContext";
import { fieldAttributes, useFieldErrors, type FieldMessages } from "../hooks/useFieldErrors";
import "./TeamSpeakPreview.css";
import "./ChannelWallpaperGenerator.css";

const RUNS_URL = `${CHANNEL_WALLPAPER_URL}/runs`;
const GENERATE_TIMEOUT_MS = 120_000;
type Options = {
  parentCid: string | null;
  namePrefix: string;
  spacerMode: "flat" | "nested-spacer";
  xOffset: string;
  yOffset: string;
  backgroundColor: string;
  coverFitMode: boolean;
};
const initialOptions: Options = {
  parentCid: null,
  namePrefix: "Wallpaper",
  spacerMode: "flat",
  xOffset: "",
  yOffset: "",
  backgroundColor: "#00000000",
  coverFitMode: true,
};
function formData(file: File | null, sourceImageUrl: string, options: Options): FormData {
  const body = new FormData();
  if (file) body.append("file", file);
  else body.append("sourceImageUrl", sourceImageUrl.trim());
  for (const [key, value] of Object.entries(options))
    if (value !== null && value !== "") body.append(key, String(value));
  return body;
}
// Key order matters: useFieldErrors focuses the first of these that carries a
// message, so this list is kept in visual form order.
const FIELD_IDS = {
  file: "wallpaper-file-upload",
  sourceImageUrl: "wallpaper-source-url",
  parentCid: "wallpaper-parent",
  namePrefix: "wallpaper-name-prefix",
  spacerMode: "wallpaper-spacer-mode",
  xOffset: "wallpaper-xOffset",
  yOffset: "wallpaper-yOffset",
  backgroundColor: "wallpaper-background",
  coverFitMode: "wallpaper-cover-fit",
};
const ADVANCED_FIELDS = ["xOffset", "yOffset", "backgroundColor", "coverFitMode"];

// Status is secondary-label text; a pending or failed run gets a warning
// glyph and a completed one a positive glyph (T-142-F1 item 3).
const RUN_STATUS: Record<
  WallpaperRun["status"],
  { label: string; tone?: "positive" | "warning"; busy?: true }
> = {
  pending: { label: "Pending", tone: "warning" },
  running: { label: "Running", busy: true },
  completed: { label: "Completed", tone: "positive" },
  "partial-failure": { label: "Partial failure", tone: "warning" },
  undoing: { label: "Undoing", busy: true },
  "undo-partial": { label: "Undo incomplete", tone: "warning" },
  undone: { label: "Undone" },
};

/**
 * The names the server gives the rows (namesForRows in
 * src/images/channel-wallpaper.controller.ts): "<prefix> <n>" for art rows,
 * "<prefix> spacer <n>" for spacer rows, each counted on its own.
 */
function rowNames(prefix: string, rows: PreviewRow[]): string[] {
  let art = 0;
  let spacer = 0;
  return rows.map((row) => (row.isSpacer ? `${prefix} spacer ${++spacer}` : `${prefix} ${++art}`));
}

/** A short label for a source URL: its file name, else its host. */
function sourceLabel(url: string): string {
  try {
    const parsed = new URL(url.trim());
    return parsed.pathname.split("/").filter(Boolean).pop() || parsed.host;
  } catch {
    return "Image URL";
  }
}

function validation(options: Options, source: string, file: File | null): FieldMessages {
  const errors: FieldMessages = {};
  if (!options.namePrefix.trim()) errors.namePrefix = "Enter a channel name prefix.";
  if (!/^#[\da-f]{6}([\da-f]{2})?$/i.test(options.backgroundColor))
    errors.backgroundColor = "Use a background color such as #00000000 or #FFFFFF.";
  for (const key of ["xOffset", "yOffset"] as const) {
    const value = options[key];
    if (value !== "" && (!Number.isSafeInteger(Number(value)) || Math.abs(Number(value)) > 20_000))
      errors[key] = "Enter a whole number between -20000 and 20000.";
  }
  if (!file && source) {
    try {
      if (new URL(source).protocol !== "https:") errors.sourceImageUrl = "Use an HTTPS image URL.";
    } catch {
      errors.sourceImageUrl = "Enter a complete HTTPS image URL.";
    }
  }
  return errors;
}
function recoverRequest(draft: string): string {
  try {
    const saved = JSON.parse(sessionStorage.getItem("wallpaper-pending-request") || "null");
    if (saved?.draft === draft && typeof saved.id === "string") return saved.id;
  } catch {
    /* Storage may be unavailable. */
  }
  const id = crypto.randomUUID();
  try {
    sessionStorage.setItem("wallpaper-pending-request", JSON.stringify({ draft, id }));
  } catch {
    /* Server run history remains available. */
  }
  return id;
}
export default function ChannelWallpaperGenerator() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceImageUrl, setSourceImageUrl] = useState("");
  const [fileResetKey, setFileResetKey] = useState(0);
  const [options, setOptions] = useState(initialOptions);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [undoTarget, setUndoTarget] = useState<WallpaperRun | null>(null);
  const [fileError, setFileError] = useState("");
  const [preview, setPreview] = useState<{ draft: string; rows: PreviewRow[] } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewRetry, setPreviewRetry] = useState(0);
  const [runs, setRuns] = useState<WallpaperRun[]>([]);
  const [runsError, setRunsError] = useState("");
  const [runsLoading, setRunsLoading] = useState(true);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const listRequest = useRef<AbortController | null>(null);
  const { getToken } = useAuth();
  const { showToast } = useToast();
  const { setOverlay, bumpRefresh, refreshKey } = usePreviewOverlay();
  const hasSource = Boolean(file) || Boolean(sourceImageUrl.trim());
  const fields = useFieldErrors(FIELD_IDS, Boolean(busy));
  const receiveFieldErrors = fields.receive;
  const clearFieldErrors = fields.clear;
  const localErrors = validation(options, sourceImageUrl, file);
  const issue = Object.values(localErrors)[0] || "";
  const fieldErrors = { ...fields.errors, ...localErrors };
  const fieldError = (key: keyof typeof FIELD_IDS) => (
    <FieldError id={FIELD_IDS[key]} message={fieldErrors[key]} />
  );
  const fieldProps = (key: keyof typeof FIELD_IDS) =>
    fieldAttributes(FIELD_IDS[key], fieldErrors[key]);
  const receiveFields = useCallback(
    (error: unknown) => {
      const handled = receiveFieldErrors(error);
      if (error instanceof ApiError && error.status && error.status < 500 && error.fieldErrors) {
        const keys = Object.keys(error.fieldErrors || {});
        if (keys.some((key) => ADVANCED_FIELDS.includes(key))) setAdvancedOpen(true);
      }
      return handled;
    },
    [receiveFieldErrors],
  );
  const draft = useMemo(
    () =>
      JSON.stringify({
        options,
        url: sourceImageUrl,
        file: file ? [file.name, file.size, file.lastModified] : null,
      }),
    [options, sourceImageUrl, file],
  );
  const rows = preview?.draft === draft ? preview.rows : [];
  const setOption = <K extends keyof Options>(key: K, value: Options[K]) => {
    fields.clear(key);
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  const chooseFile = useCallback(
    (chosen: File) => {
      const problem = imageFileError(chosen);
      if (problem) {
        setFileError(problem);
        return;
      }
      setFileError("");
      clearFieldErrors("file");
      clearFieldErrors("sourceImageUrl");
      setFile(chosen);
      setSourceImageUrl("");
    },
    [clearFieldErrors],
  );
  // Paste an image anywhere on the page (as in the Banner editor).
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (busy) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea")) return;
      const pasted = Array.from(event.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith("image/"),
      );
      if (!pasted) return;
      event.preventDefault();
      chooseFile(pasted);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [busy, chooseFile]);

  const loadRuns = useCallback(async () => {
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    setRunsError("");
    try {
      const data = await apiFetchJson<{ runs: WallpaperRun[] }>(RUNS_URL, {
        getToken,
        signal: controller.signal,
      });
      if (!Array.isArray(data.runs)) throw new Error("Invalid runs response");
      if (!controller.signal.aborted) setRuns(data.runs);
    } catch (err) {
      if (!controller.signal.aborted)
        setRunsError(describeApiError(err, "Recent operations could not be loaded."));
    } finally {
      if (!controller.signal.aborted) setRunsLoading(false);
    }
  }, [getToken]);
  useEffect(() => {
    void loadRuns();
    return () => listRequest.current?.abort();
  }, [loadRuns]);
  const activeRuns = runs.some((run) => ["pending", "running", "undoing"].includes(run.status));
  useEffect(() => {
    if (!activeRuns && !busy) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void loadRuns();
    }, 3000);
    return () => clearInterval(timer);
  }, [activeRuns, busy, loadRuns]);
  useEffect(() => {
    const controller = new AbortController();
    setPreview(null);
    setPreviewError("");
    setPreviewLoading(hasSource && !issue);
    if (!hasSource || issue) return () => controller.abort();
    const timer = setTimeout(() => {
      void apiFetchJson<{ rows: PreviewRow[] }>(CHANNEL_WALLPAPER_PREVIEW_URL, {
        method: "POST",
        body: formData(file, sourceImageUrl, options),
        getToken,
        signal: controller.signal,
        timeoutMs: UPLOAD_TIMEOUT_MS,
      })
        .then((data) => {
          if (!Array.isArray(data.rows)) throw new Error("Invalid preview response");
          if (!controller.signal.aborted) {
            clearFieldErrors();
            setPreview({ draft, rows: data.rows });
          }
        })
        .catch((err) => {
          if (!controller.signal.aborted && !receiveFields(err))
            setPreviewError(describeApiError(err, "Preview could not be generated."));
        })
        .finally(() => {
          if (!controller.signal.aborted) setPreviewLoading(false);
        });
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    draft,
    file,
    sourceImageUrl,
    options,
    hasSource,
    issue,
    getToken,
    previewRetry,
    clearFieldErrors,
    receiveFields,
  ]);
  useEffect(() => {
    setOverlay(
      preview?.draft === draft && preview.rows.length > 0
        ? { parentCid: options.parentCid, rows: preview.rows }
        : null,
    );
    return () => setOverlay(null);
  }, [preview, draft, options.parentCid, setOverlay]);
  const keepRun = (run: WallpaperRun) => {
    listRequest.current?.abort();
    setRuns((prev) => [run, ...prev.filter((r) => r.runId !== run.runId)]);
  };
  const generate = async () => {
    if (locked.current || !hasSource || issue || rows.length === 0 || previewLoading) return;
    locked.current = true;
    setBusy("generate");
    setActionError("");
    const body = formData(file, sourceImageUrl, options);
    body.append("requestId", recoverRequest(draft));
    try {
      const run = await apiFetchJson<WallpaperRun>(CHANNEL_WALLPAPER_URL, {
        method: "POST",
        body,
        getToken,
        timeoutMs: GENERATE_TIMEOUT_MS,
      });
      if (!mounted.current) {
        bumpRefresh();
        return;
      }
      keepRun(run);
      try {
        sessionStorage.removeItem("wallpaper-pending-request");
      } catch {
        /* optional persistence */
      }
      setPreview(null);
      setOverlay(null);
      bumpRefresh();
      showToast(
        run.status === "completed"
          ? `Created ${run.rowCount} channel(s).`
          : "The operation needs attention. Its results are saved below.",
        run.status === "completed" ? "success" : "error",
      );
    } catch (err) {
      if (!mounted.current) return;
      if (!receiveFields(err))
        setActionError(
          describeApiError(
            err,
            "Generation could not be confirmed. Refresh recent operations before retrying. Your existing results remain available.",
          ),
        );
      await loadRuns();
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(null);
    }
  };
  const mutateRun = async (run: WallpaperRun, action: "resume" | "undo") => {
    if (locked.current) return;
    locked.current = true;
    setBusy(`${action}:${run.runId}`);
    setActionError("");
    try {
      if (action === "resume") {
        const resumed = await apiFetchJson<WallpaperRun>(
          `${RUNS_URL}/${encodeURIComponent(run.runId)}/resume`,
          { method: "POST", getToken, timeoutMs: GENERATE_TIMEOUT_MS },
        );
        if (!mounted.current) {
          bumpRefresh();
          return;
        }
        keepRun(resumed);
      } else {
        const outcome = await apiFetchJson<{
          deleted: string[];
          failed: { cid: string; error: string }[];
          run?: WallpaperRun;
        }>(CHANNEL_WALLPAPER_UNDO_URL, {
          method: "POST",
          body: JSON.stringify({ runId: run.runId }),
          headers: { "Content-Type": "application/json" },
          getToken,
          timeoutMs: GENERATE_TIMEOUT_MS,
        });
        if (!mounted.current) {
          bumpRefresh();
          return;
        }
        if (outcome.run) keepRun(outcome.run);
        else await loadRuns();
        if (outcome.failed.length)
          setActionError(outcome.failed.map((f) => `Channel #${f.cid}: ${f.error}`).join(" "));
        showToast(
          `Deleted ${outcome.deleted.length} channel(s).`,
          outcome.failed.length ? "error" : "success",
        );
      }
      bumpRefresh();
    } catch (err) {
      if (!mounted.current) return;
      setActionError(
        describeApiError(
          err,
          "The operation could not be completed. Its previous results remain available.",
        ),
      );
      await loadRuns();
    } finally {
      locked.current = false;
      setBusy(null);
    }
  };

  const blocked = Object.keys(fieldErrors).length > 0 || Boolean(fileError);
  const names = rowNames(options.namePrefix.trim() || "Wallpaper", rows);
  const sourceName = file ? file.name : sourceLabel(sourceImageUrl);
  const undoCopy = undoTarget && {
    title:
      undoTarget.createdChannels.length === 0
        ? "Discard this operation?"
        : undoTarget.status === "undo-partial"
          ? "Retry the undo?"
          : "Undo this generation?",
    message: undoTarget.createdChannels.length
      ? `Delete the ${undoTarget.createdChannels.length} channel(s) from this operation?`
      : "Discard this incomplete operation? The server will check for any channels created by it before cleanup.",
    confirmLabel: undoTarget.createdChannels.length === 0 ? "Discard" : "Delete channels",
  };
  const runColumns: DataColumn<WallpaperRun>[] = [
    {
      key: "started",
      header: "Started",
      render: (run) =>
        run.createdAt
          ? new Date(run.createdAt).toLocaleString()
          : `Operation ${run.runId.slice(0, 8)}`,
    },
    { key: "rows", header: "Rows", align: "end", render: (run) => run.rowCount },
    {
      key: "status",
      header: "Status",
      render: (run) => {
        const status = RUN_STATUS[run.status] ?? { label: run.status };
        return (
          <span className="wallpaper-run-status" role="status">
            {status.tone ? (
              <StatusGlyph tone={status.tone} label={status.label} />
            ) : (
              <span className="wallpaper-run-state">
                {status.busy && <Spinner />}
                {status.label}
              </span>
            )}
            {(run.error || run.failedAt) && (
              <span className="wallpaper-run-error">
                {run.error || `${run.failedAt?.name}: ${run.failedAt?.error}`}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "channels",
      header: "Created channels",
      wideOnly: true,
      render: (run) =>
        run.createdChannels.length ? (
          <ul className="wallpaper-run-channels">
            {run.createdChannels.map((c) => (
              <li key={c.cid}>
                {c.name} (#{c.cid})
              </li>
            ))}
          </ul>
        ) : (
          <span className="wallpaper-run-none">None</span>
        ),
    },
    {
      key: "actions",
      header: <span className="ds-visually-hidden">Actions</span>,
      align: "end",
      render: (run) => (
        <span className="wallpaper-run-actions">
          {["pending", "partial-failure"].includes(run.status) && (
            <Button
              size="small"
              icon="refresh"
              disabled={Boolean(busy)}
              onClick={() => void mutateRun(run, "resume")}
            >
              Resume generation
            </Button>
          )}
          {!["running", "undoing", "undone"].includes(run.status) && (
            <Button
              variant="plain"
              destructive
              size="small"
              disabled={Boolean(busy)}
              onClick={() => setUndoTarget(run)}
            >
              {run.createdChannels.length === 0
                ? "Discard operation"
                : run.status === "undo-partial"
                  ? "Retry undo"
                  : "Undo this generation"}
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="studio-wallpaper">
      <h1 className="ds-visually-hidden">Channel wallpaper generator</h1>

      <Canvas
        label="Source image"
        className="wallpaper-canvas"
        overlay={
          rows.length > 0 ? (
            <p className="wallpaper-canvas-hint">Each band of 44 px becomes one channel row</p>
          ) : undefined
        }
      >
        {!hasSource && (
          <div className="wallpaper-drop">
            <UploadInput
              id="wallpaper-file-drop"
              resetKey={fileResetKey}
              disabled={Boolean(busy)}
              onFile={chooseFile}
              label="Drop the wallpaper image here, or click to browse"
            />
            <p className="wallpaper-drop-hint">
              You can also paste an image with <kbd>Ctrl V</kbd>, or load a URL in the inspector.
            </p>
          </div>
        )}
        {hasSource && rows.length > 0 && (
          <div className="wallpaper-artboard">
            <span className="wallpaper-artboard-name">
              {sourceName} · {BANNER_WIDTH} × {BANNER_HEIGHT * rows.length} · {rows.length}{" "}
              {rows.length === 1 ? "band" : "bands"}
            </span>
            <div className="wallpaper-bands" data-accent="crop">
              {rows.map((row, i) => (
                <img key={i} src={row.imageDataUrl} alt="" className="wallpaper-band" />
              ))}
            </div>
          </div>
        )}
        {hasSource && rows.length === 0 && previewLoading && (
          <StateTile icon="refresh" title="Slicing preview…" role="status" />
        )}
        {hasSource && previewError && (
          <StateTile
            icon="alert"
            title="Couldn't slice the image."
            role="alert"
            action={<Button onClick={() => setPreviewRetry((v) => v + 1)}>Try again</Button>}
          >
            {previewError}
          </StateTile>
        )}
        {!previewLoading && hasSource && !previewError && !issue && rows.length === 0 && (
          <StateTile
            icon="refresh"
            title="No current preview"
            action={<Button onClick={() => setPreviewRetry((v) => v + 1)}>Refresh preview</Button>}
          >
            The last preview no longer matches these settings.
          </StateTile>
        )}
        {hasSource && issue && rows.length === 0 && !previewLoading && (
          <StateTile icon="alert" title="Fix the highlighted fields to see the bands.">
            The inspector shows what to change.
          </StateTile>
        )}
      </Canvas>

      <Dock
        title="Rows to create"
        meta={
          rows.length > 0
            ? `TS6 · ${options.parentCid ? "below the chosen parent" : "at the top level"}`
            : undefined
        }
      >
        {rows.length > 0 ? (
          <div className="wallpaper-dock">
            <div className="ts-preview-stack">
              <figure className="ts-preview" aria-label="Rows in TeamSpeak">
                <div className="ts-preview-scroll">
                  <ul
                    className="ts-preview-tree"
                    style={{ width: TEAMSPEAK_GEOMETRY.treeWidth }}
                    aria-label="Generated rows"
                  >
                    {rows.map((row, i) => (
                      <ChannelTreeRow
                        key={i}
                        name={names[i]}
                        depth={row.depth}
                        isSpacer={row.isSpacer}
                        hasChildren={(rows[i + 1]?.depth ?? -1) > row.depth}
                        image={row.imageDataUrl}
                        imageAlt={row.isSpacer ? "spacer row" : "channel row"}
                        className="wallpaper-row"
                      />
                    ))}
                  </ul>
                </div>
              </figure>
            </div>
            <div className="wallpaper-dock-side">
              <div className="wallpaper-names">
                <span className="wallpaper-names-label">Names</span>
                <p className="wallpaper-hint">
                  {names[0]}
                  {names.length > 1 ? ` … ${names[names.length - 1]}` : ""}, created in this order{" "}
                  {options.parentCid ? "directly below the chosen parent" : "at the top level"}.
                </p>
              </div>
              <p className="wallpaper-hint">
                Exactly as TeamSpeak will show them. Undo removes all of them again.
              </p>
            </div>
          </div>
        ) : (
          <p className="wallpaper-hint">
            {hasSource
              ? "The rows appear here as soon as the image is sliced."
              : "No source image yet. Add one to see the rows that would be created."}
          </p>
        )}
      </Dock>

      <section className="wallpaper-ops" aria-labelledby="wallpaper-ops-title">
        <div className="wallpaper-ops-head">
          <h2 className="wallpaper-ops-title" id="wallpaper-ops-title">
            Recent operations
          </h2>
          <ToolbarButton
            icon="refresh"
            label="Refresh operations"
            onClick={() => void loadRuns()}
          />
        </div>
        <RequestError message={actionError} />
        <RequestError message={runsError} retry={() => void loadRuns()} />
        {runsLoading && <LoadingState label="Loading operations…" />}
        {!runsLoading && !runsError && runs.length === 0 && (
          <p className="wallpaper-hint">
            No operations yet. Generated runs appear here with their created channels.
          </p>
        )}
        {runs.length > 0 && (
          <DataTable
            label="Recent operations"
            columns={runColumns}
            rows={runs}
            rowKey={(run) => run.runId}
            footer="Results stay available after leaving this page."
          />
        )}
      </section>

      <StudioInspector>
        <Panel title="Inspector" className="wallpaper-inspector">
          <InspectorSection title="Source" meta={hasSource ? sourceName : undefined}>
            <PropertyRow label="URL">
              <TextField
                id="wallpaper-source-url"
                label="Image URL"
                labelHidden
                error={fieldErrors.sourceImageUrl}
                type="url"
                value={sourceImageUrl}
                disabled={Boolean(busy)}
                placeholder="https://…"
                onChange={(e) => {
                  fields.clear("sourceImageUrl");
                  fields.clear("file");
                  setFileError("");
                  setFileResetKey((previous) => previous + 1);
                  setSourceImageUrl(e.target.value);
                  if (e.target.value) setFile(null);
                }}
              />
            </PropertyRow>
            <div className="wallpaper-actions-row">
              <FileButton
                id={FIELD_IDS.file}
                label="Open…"
                aria-label="Open a wallpaper image"
                disabled={Boolean(busy)}
                error={fileError || fieldErrors.file}
                onFile={chooseFile}
              />
            </div>
            <p className="wallpaper-hint">
              One image is sliced top to bottom into banner-sized rows.
            </p>
          </InspectorSection>

          <InspectorSection
            title="Parent"
            meta={options.parentCid ? `#${options.parentCid}` : "Top level"}
          >
            <div
              id={FIELD_IDS.parentCid}
              tabIndex={-1}
              role="group"
              aria-label="Parent channel"
              className="wallpaper-parent"
              {...fieldProps("parentCid")}
            >
              <ChannelTreePreview
                selectable
                selectedCid={options.parentCid}
                onSelectParent={(value) => {
                  if (!busy) setOption("parentCid", value);
                }}
                refreshKey={refreshKey}
              />
            </div>
            {fieldError("parentCid")}
          </InspectorSection>

          <fieldset disabled={Boolean(busy)} className="wallpaper-options">
            <InspectorSection title="Options">
              <PropertyRow label="Name prefix" htmlFor="wallpaper-name-prefix">
                <TextField
                  id="wallpaper-name-prefix"
                  label="Channel name prefix"
                  labelHidden
                  error={fieldErrors.namePrefix}
                  value={options.namePrefix}
                  maxLength={88}
                  onChange={(e) => setOption("namePrefix", e.target.value)}
                />
              </PropertyRow>
              <PropertyRow label="Spacer mode" htmlFor={FIELD_IDS.spacerMode}>
                <Select
                  id={FIELD_IDS.spacerMode}
                  label="Spacer mode"
                  labelHidden
                  error={fieldErrors.spacerMode}
                  value={options.spacerMode}
                  onChange={(e) => setOption("spacerMode", e.target.value as Options["spacerMode"])}
                >
                  <option value="flat">Flat</option>
                  <option value="nested-spacer">Nested spacer</option>
                </Select>
              </PropertyRow>
              <Button
                variant="plain"
                size="small"
                icon={advancedOpen ? "up" : "down"}
                aria-expanded={advancedOpen}
                aria-controls="wallpaper-advanced"
                onClick={() => setAdvancedOpen((v) => !v)}
              >
                Advanced options
              </Button>
              {advancedOpen && (
                <div id="wallpaper-advanced" className="wallpaper-advanced">
                  {(["xOffset", "yOffset"] as const).map((key) => (
                    <TextField
                      key={key}
                      id={FIELD_IDS[key]}
                      label={key === "xOffset" ? "X offset (px)" : "Y offset (px)"}
                      error={fieldErrors[key]}
                      type="number"
                      step="1"
                      min="-20000"
                      max="20000"
                      value={options[key]}
                      onChange={(e) => setOption(key, e.target.value)}
                    />
                  ))}
                  <TextField
                    id={FIELD_IDS.backgroundColor}
                    label="Background color (#RRGGBBAA)"
                    error={fieldErrors.backgroundColor}
                    value={options.backgroundColor}
                    onChange={(e) => setOption("backgroundColor", e.target.value)}
                  />
                  <Checkbox
                    id={FIELD_IDS.coverFitMode}
                    label="Cover-fit mode"
                    hint="Fills nested rows with image content instead of letterboxing them."
                    error={fieldErrors.coverFitMode}
                    checked={options.coverFitMode}
                    onChange={(e) => setOption("coverFitMode", e.target.checked)}
                  />
                </div>
              )}
            </InspectorSection>
          </fieldset>

          <InspectorSection
            title="Generate"
            meta={rows.length > 0 ? `${rows.length} rows` : undefined}
          >
            {blocked && (
              <Button
                size="small"
                icon="alert"
                onClick={() => {
                  if (ADVANCED_FIELDS.some((key) => fieldErrors[key])) setAdvancedOpen(true);
                  fields.focusFirst(fieldErrors);
                }}
              >
                Review highlighted fields
              </Button>
            )}
            <Button
              variant="prominent"
              className="wallpaper-generate"
              icon={busy === "generate" ? undefined : "sparkles"}
              onClick={() => void generate()}
              disabled={Boolean(busy) || previewLoading || rows.length === 0 || blocked}
            >
              {busy === "generate" && <Spinner />}
              {busy === "generate" ? "Generating…" : "Generate channels"}
            </Button>
            <p className="wallpaper-hint">
              {rows.length > 0
                ? `Creates ${rows.length} channel${rows.length === 1 ? "" : "s"} on the server. You can undo it in Recent operations.`
                : "Add a source image to enable generating."}
            </p>
          </InspectorSection>
        </Panel>
      </StudioInspector>

      <ConfirmDialog
        open={Boolean(undoTarget)}
        title={undoCopy?.title ?? ""}
        message={undoCopy?.message ?? ""}
        confirmLabel={undoCopy?.confirmLabel ?? ""}
        destructive
        onCancel={() => setUndoTarget(null)}
        onConfirm={() => {
          const run = undoTarget;
          setUndoTarget(null);
          if (run) void mutateRun(run, "undo");
        }}
      />
    </div>
  );
}
