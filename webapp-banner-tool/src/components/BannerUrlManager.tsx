import { useCallback, useEffect, useRef, useState } from "react";
import { CHANNEL_BANNER_URLS_URL, APPLY_BANNER_URLS_URL } from "../config";
import { channelBannerEndpoint } from "../api/channels";
import type { Channel } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { apiFetch, apiFetchJson, describeApiError } from "../api/client";
import { useToast } from "./ToastContext";
import SpacerBaseImageManager from "./SpacerBaseImageManager";
import { usePreviewOverlay } from "../preview/PreviewOverlayContext";
import RequestError from "./RequestError";
import Icon from "./ui/Icon";
import PageHeader from "./ui/PageHeader";
import Section from "./ui/Section";
import { EmptyState, LoadingState, Skeleton } from "./ui/States";

export default function BannerUrlManager() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const lock = useRef(false);
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  const actionRequest = useRef<AbortController | null>(null);
  const { getToken } = useAuth();
  const { showToast } = useToast();
  const { bumpRefresh } = usePreviewOverlay();
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const data = await apiFetchJson<{ channels: Channel[] }>(CHANNEL_BANNER_URLS_URL, {
        getToken,
        signal: controller.signal,
      });
      if (!Array.isArray(data.channels)) throw new Error("Invalid channels");
      if (!controller.signal.aborted) setChannels(data.channels);
    } catch (err) {
      if (!controller.signal.aborted)
        setError(describeApiError(err, "Channel banner status could not be loaded."));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [getToken]);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      request.current?.abort();
      actionRequest.current?.abort();
    };
  }, [load]);
  const pending = channels.filter((c) => !c.managed);
  const apply = async (cid?: string) => {
    if (lock.current) return;
    if (!cid && !window.confirm(`Set managed banner URLs for ${pending.length} channel(s)?`))
      return;
    lock.current = true;
    const controller = new AbortController();
    actionRequest.current = controller;
    setBusy(cid || "all");
    setError("");
    try {
      if (cid) {
        await apiFetch(channelBannerEndpoint(cid), {
          method: "PATCH",
          getToken,
          signal: controller.signal,
        });
        if (!mounted.current || controller.signal.aborted) return;
        setResult("Banner URL updated.");
      } else {
        const outcome = await apiFetchJson<{
          updated: string[];
          alreadyManaged: string[];
          failed?: { cid?: string; name?: string; error: string }[];
        }>(APPLY_BANNER_URLS_URL, {
          method: "POST",
          getToken,
          signal: controller.signal,
          timeoutMs: 120_000,
        });
        if (!mounted.current || controller.signal.aborted) return;
        setResult(
          `Updated ${outcome.updated.length} channel(s); ${outcome.alreadyManaged.length} already correct.`,
        );
        if (outcome.failed?.length)
          setResult(
            `Updated ${outcome.updated.length}. Failed: ${outcome.failed.map((f) => `${f.name || f.cid}: ${f.error}`).join("; ")}`,
          );
      }
      await load();
      if (!mounted.current || controller.signal.aborted) return;
      bumpRefresh();
      showToast("Banner URL operation finished. See the result below.", "info");
    } catch (err) {
      if (mounted.current && !controller.signal.aborted) {
        setError(describeApiError(err, "Banner URLs could not be applied."));
        bumpRefresh();
      }
    } finally {
      if (actionRequest.current === controller) actionRequest.current = null;
      lock.current = false;
      if (mounted.current) setBusy(null);
    }
  };
  const managed = channels.length - pending.length;
  return (
    <div>
      <PageHeader
        eyebrow="TeamSpeak"
        icon="link"
        title="Channel banner URLs"
        lead="Point each channel's TeamSpeak banner at the image this application serves. Until a channel is managed, TeamSpeak keeps showing whatever URL it had before."
        actions={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void load()}
            disabled={loading}
          >
            <Icon name="refresh" size={15} />
            Refresh
          </button>
        }
      />

      <div className="page-sections">
        <div className="stat-grid">
          <div className="stat">
            <p className="stat-label">
              <Icon name="check" size={13} />
              Managed
            </p>
            <p className="stat-value">{loading ? "—" : managed}</p>
          </div>
          <div className="stat">
            <p className="stat-label">
              <Icon name="alert" size={13} />
              Not managed
            </p>
            <p className="stat-value">{loading ? "—" : pending.length}</p>
          </div>
          <div className="stat">
            <p className="stat-label">
              <Icon name="tree" size={13} />
              Channels
            </p>
            <p className="stat-value">{loading ? "—" : channels.length}</p>
          </div>
        </div>

        <Section
          title="Apply to every channel"
          icon="sparkles"
          subtitle="Rewrites the banner URL of each channel that is not managed yet. Existing images are untouched."
          footer={
            <button
              type="button"
              className="btn btn-primary"
              disabled={Boolean(busy) || loading || Boolean(error)}
              onClick={() => void apply()}
            >
              {busy === "all" ? (
                <span className="spinner" aria-hidden="true" />
              ) : (
                <Icon name="link" size={15} />
              )}
              {busy === "all" ? "Applying…" : "Set for all channels"}
            </button>
          }
        >
          <p className="hint">
            {loading
              ? "Checking which channels already point at this application…"
              : pending.length === 0
                ? "Every channel already points at a managed banner URL."
                : `${pending.length} channel(s) still point somewhere else.`}
          </p>
          {result && (
            <p role="status" className="alert alert-info">
              <Icon name="info" size={16} />
              <span className="alert-body">{result}</span>
            </p>
          )}
        </Section>

        <SpacerBaseImageManager />

        <RequestError message={error} retry={() => void load()} />

        {loading && (
          <div className="card">
            <LoadingState label="Loading channels…" />
            <Skeleton height={54} radius={10} />
          </div>
        )}

        {!loading && !error && channels.length === 0 && (
          <div className="card">
            <EmptyState
              icon="inbox"
              title="No channels found."
              description="TeamSpeak reported no channels for this server."
            />
          </div>
        )}

        {!loading && channels.length > 0 && (
          <section className="card">
            <div className="card-head">
              <div className="card-head-text">
                <h2 className="card-title">
                  <Icon name="tree" size={16} />
                  Per channel
                </h2>
                <p className="card-subtitle">
                  Set a single channel's banner URL without touching the rest.
                </p>
              </div>
            </div>
            <ul className="url-list">
              {channels.map((channel) => (
                <li className="url-row" key={channel.cid}>
                  <div className="url-row-main">
                    <p className="url-row-name truncate" title={channel.name}>
                      {channel.name}
                    </p>
                    <p className="url-row-meta">
                      <span
                        className={`badge ${channel.managed ? "badge-managed" : "badge-unmanaged"}`}
                      >
                        {channel.managed ? "Managed" : "Not managed"}
                      </span>
                      <span className="muted">Channel #{channel.cid}</span>
                    </p>
                    <p className="url-text mono">{channel.bannerGfxUrl || "No banner URL set"}</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={Boolean(busy)}
                    onClick={() => void apply(channel.cid)}
                  >
                    {busy === channel.cid ? "Setting…" : "Set banner URL"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
