import { useCallback, useEffect, useRef, useState } from "react";
import { CHANNEL_BANNER_URLS_URL, APPLY_BANNER_URLS_URL } from "../config";
import { channelBannerEndpoint } from "../api/channels";
import type { Channel } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { apiFetch, apiFetchJson, describeApiError } from "../api/client";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Icon,
  ListRow,
  ListSection,
  LoadingState,
  PageHeader,
  RequestError,
  Skeleton,
  Spinner,
  Stack,
  StatusGlyph,
  ToolbarButton,
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
  const [confirming, setConfirming] = useState(false);
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
    <Stack gap={7}>
      <PageHeader
        title="Channel banner URLs"
        subtitle="Point each channel's TeamSpeak banner at the image this application serves."
        toolbar={
          <ToolbarButton
            icon="refresh"
            label="Refresh"
            onClick={() => void load()}
            disabled={loading}
          />
        }
      />

      <ListSection header="Apply to all">
        <ListRow
          title={
            loading
              ? "Checking which channels already point at this application…"
              : pending.length === 0
                ? "Every channel already points at a managed banner URL."
                : `${pending.length} channel(s) still point somewhere else.`
          }
          subtitle="Existing images stay as they are."
          trailing={
            <Button
              variant="prominent"
              icon={busy === "all" ? undefined : "link"}
              disabled={Boolean(busy) || loading || Boolean(error)}
              onClick={() => setConfirming(true)}
            >
              {busy === "all" && <Spinner />}
              {busy === "all" ? "Applying…" : "Set for all channels"}
            </Button>
          }
        >
          {result && (
            <p role="status" className="banner-urls-result">
              <Icon name="info" size={16} />
              <span className="banner-urls-result-body">{result}</span>
            </p>
          )}
        </ListRow>
      </ListSection>

      <SpacerBaseImageManager />

      <RequestError message={error} retry={() => void load()} />

      {loading && (
        <>
          <LoadingState label="Loading channels…" />
          <ListSection header="Per channel">
            {[0, 1, 2].map((key) => (
              <ListRow
                key={key}
                aria-hidden="true"
                title={<Skeleton height={14} width="40%" />}
                subtitle={<Skeleton height={10} width="25%" />}
              />
            ))}
          </ListSection>
        </>
      )}

      {!loading && !error && channels.length === 0 && (
        <EmptyState
          icon="inbox"
          title="No channels found."
          description="TeamSpeak reported no channels for this server."
        />
      )}

      {!loading && channels.length > 0 && (
        <ListSection header={`${managed} of ${channels.length} managed`}>
          {channels.map((channel) => (
            <ListRow
              key={channel.cid}
              title={<span title={channel.name}>{channel.name}</span>}
              subtitle={
                <>
                  <StatusGlyph
                    tone={channel.managed ? "positive" : "warning"}
                    label={channel.managed ? "Managed" : "Not managed"}
                  />
                  <span>
                    {" · "}Channel #{channel.cid}
                  </span>
                </>
              }
              trailing={
                <Button
                  size="small"
                  disabled={Boolean(busy)}
                  onClick={() => void apply(channel.cid)}
                >
                  {busy === channel.cid ? "Setting…" : "Set banner URL"}
                </Button>
              }
            >
              {channel.bannerGfxUrl ? (
                <p className="banner-urls-row-url">{channel.bannerGfxUrl}</p>
              ) : (
                <p className="banner-urls-row-empty">No banner URL set</p>
              )}
            </ListRow>
          ))}
        </ListSection>
      )}

      <ConfirmDialog
        open={confirming}
        title="Set banner URLs?"
        message={`Set managed banner URLs for ${pending.length} channel(s)?`}
        confirmLabel="Set URLs"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void apply();
        }}
      />
    </Stack>
  );
}
