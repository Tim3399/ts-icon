import { Button } from "../primitives/Button";
import { Icon } from "../primitives/Icon";
import "./Feedback.css";

// A failed request is never rendered as an empty result: it keeps its own
// alert, states what failed and always offers the way back (retry) when the
// caller knows how to repeat the request.
export function RequestError({ message, retry }: { message: string; retry?: () => void }) {
  return message ? (
    <div role="alert" className="ds-request-error">
      <Icon name="alert" size={17} className="ds-request-error-icon" />
      <span className="ds-request-error-body">{message}</span>
      {retry && (
        <Button size="small" icon="refresh" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  ) : null;
}
