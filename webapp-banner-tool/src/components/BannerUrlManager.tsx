import { useCallback, useEffect, useRef, useState } from "react";
import { CHANNEL_BANNER_URLS_URL, APPLY_BANNER_URLS_URL } from "../config";
import { channelBannerEndpoint } from "../api/channels";
import type { Channel } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { apiFetch, apiFetchJson, describeApiError } from "../api/client";
import {
  Button,
  EmptyState,
  Icon,
  LoadingState,
  PageHeader,
  RequestError,
  Section,
  Skeleton,
  Spinner,
  Stack,
  Grid,
  useToast,
} from "../design";
import SpacerBaseImageManager from "./SpacerBaseImageManager";
import { usePreviewOverlay } from "../preview/PreviewOverlayContext";
import "./BannerUrlManager.css";

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
    <Stack gap={5}>
      <PageHeader
        eyebrow="TeamSpeak"
        icon="link"
        title="Channel banner URLs"
        lead="Point each channel's TeamSpeak banner at the image this application serves. Until a channel is managed, TeamSpeak keeps showing whatever URL it had before."
        actions={
          <Button icon="refresh" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        }
      />

      <Grid gap={3} min="small">
        <div className="banner-urls-stat">
          <p className="banner-urls-stat-label">
            <Icon name="check" size={13} />
            Managed
          </p>
          <p className="banner-urls-stat-value">{loading ? "—" : managed}</p>
        </div>
        <div className="banner-urls-stat">
          <p className="banner-urls-stat-label">
            <Icon name="alert" size={13} />
            Not managed
          </p>
          <p className="banner-urls-stat-value">{loading ? "—" : pending.length}</p>
        </div>
        <div className="banner-urls-stat">
          <p className="banner-urls-stat-label">
            <Icon name="tree" size={13} />
            Channels
          </p>
          <p className="banner-urls-stat-value">{loading ? "—" : channels.length}</p>
        </div>
      </Grid>

      <Section
        title="Apply to every channel"
        icon="sparkles"
        subtitle="Rewrites the banner URL of each channel that is not managed yet. Existing images are untouched."
        footer={
          <Button
            variant="prominent"
            icon={busy === "all" ? undefined : "link"}
            disabled={Boolean(busy) || loading || Boolean(error)}
            onClick={() => void apply()}
          >
            {busy === "all" && <Spinner />}
            {busy === "all" ? "Applying…" : "Set for all channels"}
          </Button>
        }
      >
        <p className="banner-urls-hint">
          {loading
            ? "Checking which channels already point at this application…"
            : pending.length === 0
              ? "Every channel already points at a managed banner URL."
              : `${pending.length} channel(s) still point somewhere else.`}
        </p>
        {result && (
          <p role="status" className="banner-urls-result">
            <Icon name="info" size={16} />
            <span className="banner-urls-result-body">{result}</span>
          </p>
        )}
      </Section>

      <SpacerBaseImageManager />

      <RequestError message={error} retry={() => void load()} />

      {loading && (
        <Section title="Per channel" icon="tree">
          <LoadingState label="Loading channels…" />
          <Skeleton height={54} radius="control" />
        </Section>
      )}

      {!loading && !error && channels.length === 0 && (
        <Section title="Per channel" icon="tree">
          <EmptyState
            icon="inbox"
            title="No channels found."
            description="TeamSpeak reported no channels for this server."
          />
        </Section>
      )}

      {!loading && channels.length > 0 && (
        <Section
          title="Per channel"
          icon="tree"
          subtitle="Set a single channel's banner URL without touching the rest."
        >
          <ul className="banner-urls-list">
            {channels.map((channel) => (
              <li className="banner-urls-row" key={channel.cid}>
                <div className="banner-urls-row-main">
                  <p className="banner-urls-row-name" title={channel.name}>
                    {channel.name}
                  </p>
                  <p className="banner-urls-row-meta">
                    <span
                      className="banner-urls-status"
                      data-managed={channel.managed ? "true" : "false"}
                    >
                      <Icon name={channel.managed ? "check" : "alert"} size={13} />
                      {channel.managed ? "Managed" : "Not managed"}
                    </span>
                    <span className="banner-urls-row-id">Channel #{channel.cid}</span>
                  </p>
                  <p className="banner-urls-row-url">
                    {channel.bannerGfxUrl || "No banner URL set"}
                  </p>
                </div>
                <Button
                  size="small"
                  disabled={Boolean(busy)}
                  onClick={() => void apply(channel.cid)}
                >
                  {busy === channel.cid ? "Setting…" : "Set banner URL"}
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Stack>
  );
}
