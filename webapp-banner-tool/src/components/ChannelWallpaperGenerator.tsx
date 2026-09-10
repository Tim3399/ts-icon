import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CHANNEL_WALLPAPER_URL,
  CHANNEL_WALLPAPER_PREVIEW_URL,
  CHANNEL_WALLPAPER_UNDO_URL,
} from "../config";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiFetchJson, describeApiError, UPLOAD_TIMEOUT_MS } from "../api/client";
import type { PreviewRow, WallpaperRun } from "../api/types";
import { useToast } from "./ToastContext";
import ChannelTreePreview from "./ChannelTreePreview";
import { usePreviewOverlay } from "../preview/PreviewOverlayContext";
import UploadInput from "./UploadInput";
import RequestError from "./RequestError";
import FieldError from "./FieldError";
import Icon from "./ui/Icon";
import PageHeader from "./ui/PageHeader";
import Section from "./ui/Section";
import { EmptyState, LoadingState } from "./ui/States";
import { fieldAttributes, useFieldErrors, type FieldMessages } from "../hooks/useFieldErrors";

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

const RUN_STATUS: Record<WallpaperRun["status"], { label: string; badge: string }> = {
  pending: { label: "Pending", badge: "badge-warning" },
  running: { label: "Running", badge: "badge-accent badge-busy" },
  completed: { label: "Completed", badge: "badge-managed" },
  "partial-failure": { label: "Partial failure", badge: "badge-danger" },
  undoing: { label: "Undoing", badge: "badge-accent badge-busy" },
  "undo-partial": { label: "Undo incomplete", badge: "badge-danger" },
  undone: { label: "Undone", badge: "badge-neutral" },
};

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
    if (
      action === "undo" &&
      !window.confirm(
        run.createdChannels.length
          ? `Delete the ${run.createdChannels.length} channel(s) from this operation?`
          : "Discard this incomplete operation? The server will check for any channels created by it before cleanup.",
      )
    )
      return;
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

  const blocked = Object.keys(fieldErrors).length > 0;

  return (
    <div>
      <PageHeader
        eyebrow="Bulk operation"
        icon="sparkles"
        title="Channel wallpaper generator"
        lead="Slice one large image into 500 × 44 rows and create a channel per row, so the artwork reads as a single wallpaper down the channel list. Every run can be undone."
      />

      <div className="workbench workbench-wide">
        <div className="workbench-main">
          <Section
            title="Source image"
            step={1}
            subtitle="One image is sliced top to bottom into banner-sized rows."
          >
            <UploadInput
              id="wallpaper-file-upload"
              resetKey={fileResetKey}
              error={fieldErrors.file}
              disabled={Boolean(busy)}
              label={file ? `Selected: ${file.name}` : undefined}
              onFile={(chosen) => {
                fields.clear("file");
                fields.clear("sourceImageUrl");
                setFile(chosen);
                setSourceImageUrl("");
              }}
            />
            <div className="field">
              <label htmlFor="wallpaper-source-url">Or load from a URL instead</label>
              <input
                className="input"
                id="wallpaper-source-url"
                {...fieldProps("sourceImageUrl")}
                type="url"
                value={sourceImageUrl}
                disabled={Boolean(busy)}
                placeholder="https://example.com/wallpaper.png"
                onChange={(e) => {
                  fields.clear("sourceImageUrl");
                  fields.clear("file");
                  setFileResetKey((previous) => previous + 1);
                  setSourceImageUrl(e.target.value);
                  if (e.target.value) setFile(null);
                }}
              />
              {fieldError("sourceImageUrl")}
            </div>
          </Section>

          <Section
            title="Parent channel"
            step={2}
            subtitle="The generated channels are created below this channel, or at the top level."
          >
            <div
              id={FIELD_IDS.parentCid}
              tabIndex={-1}
              role="group"
              aria-label="Parent channel"
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
          </Section>

          <Section
            title="Options"
            step={3}
            icon="sliders"
            subtitle="Naming and layout of the channels that will be created."
          >
            <fieldset disabled={Boolean(busy)} className="plain-fieldset">
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="wallpaper-name-prefix">Channel name prefix</label>
                  <input
                    id="wallpaper-name-prefix"
                    {...fieldProps("namePrefix")}
                    className="input"
                    value={options.namePrefix}
                    maxLength={88}
                    onChange={(e) => setOption("namePrefix", e.target.value)}
                  />
                  {fieldError("namePrefix")}
                </div>
                <div className="field">
                  <label htmlFor={FIELD_IDS.spacerMode}>Spacer mode</label>
                  <span className="select-wrap">
                    <select
                      className="input"
                      id={FIELD_IDS.spacerMode}
                      {...fieldProps("spacerMode")}
                      value={options.spacerMode}
                      onChange={(e) =>
                        setOption("spacerMode", e.target.value as Options["spacerMode"])
                      }
                    >
                      <option value="flat">Flat</option>
                      <option value="nested-spacer">Nested spacer</option>
                    </select>
                  </span>
                  {fieldError("spacerMode")}
                </div>
              </div>
              <div className="advanced">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  aria-expanded={advancedOpen}
                  aria-controls="wallpaper-advanced"
                  onClick={() => setAdvancedOpen((v) => !v)}
                >
                  <Icon name={advancedOpen ? "up" : "down"} size={14} />
                  Advanced options
                </button>
                {advancedOpen && (
                  <div id="wallpaper-advanced" className="advanced-body">
                    <div className="field-grid">
                      {(["xOffset", "yOffset"] as const).map((key) => (
                        <div className="field" key={key}>
                          <label htmlFor={FIELD_IDS[key]}>
                            {key === "xOffset" ? "X offset (px)" : "Y offset (px)"}
                          </label>
                          <input
                            id={FIELD_IDS[key]}
                            {...fieldProps(key)}
                            className="input"
                            type="number"
                            step="1"
                            min="-20000"
                            max="20000"
                            value={options[key]}
                            onChange={(e) => setOption(key, e.target.value)}
                          />
                          {fieldError(key)}
                        </div>
                      ))}
                      <div className="field">
                        <label htmlFor={FIELD_IDS.backgroundColor}>
                          Background color (#RRGGBBAA)
                        </label>
                        <input
                          className="input"
                          id={FIELD_IDS.backgroundColor}
                          {...fieldProps("backgroundColor")}
                          value={options.backgroundColor}
                          onChange={(e) => setOption("backgroundColor", e.target.value)}
                        />
                        {fieldError("backgroundColor")}
                      </div>
                    </div>
                    <label className="check">
                      <input
                        type="checkbox"
                        id={FIELD_IDS.coverFitMode}
                        {...fieldProps("coverFitMode")}
                        checked={options.coverFitMode}
                        onChange={(e) => setOption("coverFitMode", e.target.checked)}
                      />
                      <span className="check-text">
                        Cover-fit mode
                        <span className="check-hint">
                          Fills nested rows with image content instead of letterboxing them.
                        </span>
                      </span>
                    </label>
                    {fieldError("coverFitMode")}
                  </div>
                )}
              </div>
            </fieldset>
          </Section>
        </div>

        <div className="workbench-side">
          <Section
            title="Preview"
            step={4}
            className="workbench-sticky"
            subtitle="Exactly the rows that will be created, at their real proportions."
            actions={
              rows.length > 0 ? (
                <span className="badge badge-neutral">{rows.length} rows</span>
              ) : undefined
            }
            footer={
              <button
                type="button"
                className="btn btn-primary btn-lg btn-block"
                onClick={() => void generate()}
                disabled={Boolean(busy) || previewLoading || rows.length === 0 || blocked}
              >
                {busy === "generate" ? (
                  <span className="spinner" aria-hidden="true" />
                ) : (
                  <Icon name="sparkles" size={15} />
                )}
                {busy === "generate" ? "Generating…" : "Generate channels"}
              </button>
            }
          >
            {blocked && (
              <button
                type="button"
                className="btn btn-secondary btn-sm btn-block"
                onClick={() => {
                  if (ADVANCED_FIELDS.some((key) => fieldErrors[key])) setAdvancedOpen(true);
                  fields.focusFirst(fieldErrors);
                }}
              >
                <Icon name="alert" size={14} />
                Review highlighted fields
              </button>
            )}
            <RequestError message={previewError} retry={() => setPreviewRetry((v) => v + 1)} />
            {previewLoading && <LoadingState label="Slicing preview…" />}
            {!hasSource && (
              <EmptyState
                icon="image"
                title="No source image yet"
                description="Add a source image to see the rows that would be created."
              />
            )}
            {!previewLoading && hasSource && !previewError && !issue && rows.length === 0 && (
              <EmptyState
                icon="refresh"
                title="No current preview"
                description="The last preview no longer matches these settings."
                action={
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setPreviewRetry((v) => v + 1)}
                  >
                    Refresh preview
                  </button>
                }
              />
            )}
            {rows.length > 0 && (
              <div className="wallpaper-preview-stack checkerboard scroll-area">
                {rows.map((row, i) => (
                  <img
                    key={i}
                    src={row.imageDataUrl}
                    alt={row.isSpacer ? "spacer row" : "channel row"}
                    style={{ marginLeft: row.depth * 20 }}
                    className="wallpaper-preview-row"
                  />
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>

      <div className="page-sections page-sections-after">
        <RequestError message={actionError} />
        <Section
          title="Recent operations"
          icon="undo"
          subtitle="Results stay available after leaving this page. Resume an incomplete generation, or undo one that finished."
          actions={
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void loadRuns()}
            >
              <Icon name="refresh" size={14} />
              Refresh operations
            </button>
          }
        >
          <RequestError message={runsError} retry={() => void loadRuns()} />
          {runsLoading && <LoadingState label="Loading operations…" />}
          {!runsLoading && !runsError && runs.length === 0 && (
            <EmptyState
              icon="inbox"
              title="No operations yet"
              description="Generated runs appear here with their created channels."
            />
          )}
          {runs.length > 0 && (
            <ul className="run-list">
              {runs.map((run) => {
                const status = RUN_STATUS[run.status] ?? {
                  label: run.status,
                  badge: "badge-neutral",
                };
                return (
                  <li className="run-card" key={run.runId}>
                    <div className="run-card-head">
                      <h3 className="run-card-title">
                        {run.createdAt
                          ? new Date(run.createdAt).toLocaleString()
                          : `Operation ${run.runId.slice(0, 8)}`}
                      </h3>
                      <span className={`badge ${status.badge}`}>{status.label}</span>
                    </div>
                    <p role="status" className="hint">
                      Status: {run.status}. {run.rowCount} channel(s) remaining.
                    </p>
                    {(run.error || run.failedAt) && (
                      <RequestError
                        message={run.error || `${run.failedAt?.name}: ${run.failedAt?.error}`}
                      />
                    )}
                    {run.createdChannels.length > 0 && (
                      <ul className="run-channels">
                        {run.createdChannels.map((c) => (
                          <li key={c.cid}>
                            {c.name} (#{c.cid})
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="actions-row" style={{ marginTop: "var(--space-4)" }}>
                      {["pending", "partial-failure"].includes(run.status) && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={Boolean(busy)}
                          onClick={() => void mutateRun(run, "resume")}
                        >
                          <Icon name="refresh" size={14} />
                          Resume generation
                        </button>
                      )}
                      {!["running", "undoing", "undone"].includes(run.status) && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={Boolean(busy)}
                          onClick={() => void mutateRun(run, "undo")}
                        >
                          <Icon name="undo" size={14} />
                          {run.createdChannels.length === 0
                            ? "Discard operation"
                            : run.status === "undo-partial"
                              ? "Retry undo"
                              : "Undo this generation"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
