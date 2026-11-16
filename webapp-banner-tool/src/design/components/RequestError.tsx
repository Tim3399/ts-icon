import { Button } from "../primitives/Button";
import { Icon } from "../primitives/Icon";
import { StateTile } from "./StateTile";
import "./Feedback.css";

interface RequestErrorProps {
  message: string;
  retry?: () => void;
  /**
   * "inline" (default): a quiet one-line alert inside a panel or form.
   * "tile": the D2 error state tile, for a page or region whose content failed
   * to load (T-142-F3 item 11).
   */
  layout?: "inline" | "tile";
}

// A failed request is never rendered as an empty result: it keeps its own
// alert, states what failed and always offers the way back (retry) when the
// caller knows how to repeat the request.
export function RequestError({ message, retry, layout = "inline" }: RequestErrorProps) {
  if (!message) return null;
  const tryAgain = retry && (
    <Button size="small" icon="refresh" onClick={retry}>
      Try again
    </Button>
  );
  if (layout === "tile")
    return <StateTile icon="alert" title={message} level="p" role="alert" action={tryAgain} />;
  return (
    <div role="alert" className="ds-request-error">
      <Icon name="alert" size={16} className="ds-request-error-icon" />
      <span className="ds-request-error-body">{message}</span>
      {tryAgain}
    </div>
  );
}
