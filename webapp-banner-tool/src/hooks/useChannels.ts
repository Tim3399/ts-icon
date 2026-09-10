import { useCallback, useEffect, useRef, useState } from "react";
import { GET_CHANNELS_LIST_URL } from "../config";
import { useAuth } from "../auth/AuthContext";
import { apiFetchJson, describeApiError, isCancelled } from "../api/client";
import type { Channel, ChannelList } from "../api/types";
export function useChannels() {
  const { getToken } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setError("");
    try {
      const data = await apiFetchJson<ChannelList>(GET_CHANNELS_LIST_URL, {
        getToken,
        signal: controller.signal,
      });
      if (!Array.isArray(data.items)) throw new Error("Invalid channel response");
      if (!controller.signal.aborted) setChannels(data.items);
    } catch (err) {
      if (!controller.signal.aborted && !isCancelled(err))
        setError(describeApiError(err, "Channels could not be loaded. Try again."));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [getToken]);
  useEffect(() => {
    void reload();
    return () => active.current?.abort();
  }, [reload]);
  return { channels, setChannels, loading, error, reload };
}
