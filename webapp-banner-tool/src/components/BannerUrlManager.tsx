import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { CHANNEL_BANNER_URLS_URL, APPLY_BANNER_URLS_URL } from "../config";
import { channelBannerEndpoint } from "../api/channels";
import type { Channel } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { apiFetch, apiFetchJson, describeApiError } from "../api/client";
import {
  Button,
  ConfirmDialog,
  DataTable,
  FilterBar,
  Icon,
  SegmentedControl,
  Spinner,
  StateTile,
  StatusGlyph,
  StudioInspector,
  StudioToolbar,
  TextField,
  ToolbarButton,
  useToast,
  type DataColumn,
} from "../design";
import SpacerBaseImageManager from "./SpacerBaseImageManager";
import BannerUrlInspector from "./BannerUrlInspector";
import { usePreviewOverlay } from "../preview/PreviewOverlayContext";
import "./BannerUrlManager.css";

// Banner URLs as concept D2 draws it (T-142-F3 item 10): a filter bar with the
// page's one prominent action, the channel table, and an inspector for the
// selected row with the spacer base image below it.

type ManagedFilter = "all" | "managed" | "unmanaged";

const FILTERS: { value: ManagedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "managed", label: "Managed" },
  { value: "unmanaged", label: "Not managed" },
];

export default function BannerUrlManager() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ManagedFilter>("all");
  const [selectedCid, setSelectedCid] = useState<string | null>(null);
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
  const visible = channels.filter(
    (c) =>
      c.name.toLowerCase().includes(query.trim().toLowerCase()) &&
      (filter === "all" || (filter === "managed") === Boolean(c.managed)),
  );
  const filtered = query.trim() !== "" || filter !== "all";
  // The selection follows the filter: a hidden row hands it to the first visible one.
  const selected = visible.find((c) => c.cid === selectedCid) ?? visible[0] ?? null;

  const columns: DataColumn<Channel>[] = [
    {
      key: "channel",
      header: "Channel",
      className: "banner-urls-cell-name",
      render: (channel) => (
        <span className="banner-urls-name" style={{ "--depth": channel.depth } as CSSProperties}>
          <Icon name={channel.isSpacer ? "sliders" : "layers"} size={14} />
          <span className="banner-urls-name-text" title={channel.name}>
            {channel.name}
          </span>
          {channel.isSpacer && <span className="banner-urls-tag">Spacer</span>}
          {!channel.managed && (
            <span className="banner-urls-tag banner-urls-tag-state">Not managed</span>
          )}
        </span>
      ),
    },
    {
      key: "state",
      header: "State",
      className: "banner-urls-cell-state",
      render: (channel) => (
        <StatusGlyph
          tone={channel.managed ? "positive" : "warning"}
          label={channel.managed ? "Managed" : "Not managed"}
        />
      ),
    },
    {
      key: "url",
      header: "Banner URL",
      className: "banner-urls-cell-url",
      render: (channel) =>
        channel.bannerGfxUrl ? (
          <code className="banner-urls-url">{channel.bannerGfxUrl}</code>
        ) : (
          <span className="banner-urls-none">No banner URL set</span>
        ),
    },
    {
      key: "id",
      header: "ID",
      wideOnly: true,
      className: "banner-urls-cell-number",
      render: (channel) => `#${channel.cid}`,
    },
    {
      key: "action",
      header: <span className="ds-visually-hidden">Action</span>,
      align: "end",
      className: "banner-urls-cell-action",
      render: (channel) => (
        <Button
          size="small"
          aria-label={`Set banner URL for ${channel.name}`}
          disabled={Boolean(busy)}
          onClick={() => void apply(channel.cid)}
        >
          {busy === channel.cid ? "Setting…" : "Set URL"}
        </Button>
      ),
    },
  ];

  return (
    <div className="banner-urls">
      <h1 className="ds-visually-hidden">Channel banner URLs</h1>
      <StudioToolbar>
        <ToolbarButton
          icon="refresh"
          label="Refresh"
          onClick={() => void load()}
          disabled={loading}
        />
      </StudioToolbar>

      <FilterBar
        search={
          <TextField
            id="banner-urls-search"
            type="search"
            label="Filter channels"
            labelHidden
            value={query}
            placeholder="Filter channels"
            onChange={(e) => setQuery(e.target.value)}
          />
        }
        filter={
          <SegmentedControl
            label="Managed state"
            options={FILTERS}
            value={filter}
            onChange={setFilter}
          />
        }
        count={
          loading || (error && channels.length === 0)
            ? undefined
            : `${visible.length} of ${channels.length} channel${channels.length === 1 ? "" : "s"} · ${managed} managed`
        }
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
      />

      {result && (
        <p role="status" className="banner-urls-result">
          <Icon name="info" size={16} />
          <span className="banner-urls-result-body">{result}</span>
        </p>
      )}

      {error && channels.length > 0 && (
        <p role="alert" className="banner-urls-error">
          <Icon name="alert" size={16} />
          <span className="banner-urls-result-body">{error}</span>
          <Button size="small" icon="refresh" onClick={() => void load()}>
            Try again
          </Button>
        </p>
      )}

      {loading && <StateTile icon="refresh" title="Loading channels…" role="status" />}

      {!loading && error && channels.length === 0 && (
        <StateTile
          icon="alert"
          title="Couldn't load the channels."
          role="alert"
          action={<Button onClick={() => void load()}>Try again</Button>}
        >
          {error}
        </StateTile>
      )}

      {!loading && !error && visible.length === 0 && (
        <StateTile
          icon="inbox"
          title={channels.length ? "No channels match these filters." : "No channels found."}
          action={
            filtered && channels.length ? (
              <Button
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Reset filters
              </Button>
            ) : (
              <Button onClick={() => void load()}>Refresh</Button>
            )
          }
        >
          {channels.length
            ? "Clear the search or choose a different state."
            : "TeamSpeak reported no channels for this server."}
        </StateTile>
      )}

      {!loading && visible.length > 0 && (
        <DataTable
          label="Channel banner URLs"
          columns={columns}
          rows={visible}
          rowKey={(channel) => channel.cid}
          selectedKey={selected?.cid ?? null}
          onSelect={(channel) => setSelectedCid(channel.cid)}
          rowProps={(channel) => ({ className: "banner-urls-row", "data-cid": channel.cid })}
          footer={
            '"Set for all channels" points every channel that is not managed yet at the banner this application serves. Existing images stay as they are.'
          }
        />
      )}

      <StudioInspector>
        <div className="banner-urls-inspector">
          <div className="banner-urls-inspector-head" aria-hidden="true">
            Inspector
          </div>
          {selected && (
            <BannerUrlInspector
              channel={selected}
              channels={channels}
              busy={Boolean(busy)}
              setting={busy === selected.cid}
              onSet={() => void apply(selected.cid)}
            />
          )}
          <SpacerBaseImageManager />
        </div>
      </StudioInspector>

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
    </div>
  );
}
