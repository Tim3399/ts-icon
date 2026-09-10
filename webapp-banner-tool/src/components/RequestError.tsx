import Icon from "./ui/Icon";

// A failed request is never rendered as an empty result: it keeps its own
// alert, states what failed and always offers the way back (retry) when the
// caller knows how to repeat the request.
export default function RequestError({ message, retry }: { message: string; retry?: () => void }) {
  return message ? (
    <div role="alert" className="alert alert-error">
      <Icon name="alert" size={16} />
      <span className="alert-body">{message}</span>
      {retry && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={retry}>
          <Icon name="refresh" size={14} />
          Try again
        </button>
      )}
    </div>
  ) : null;
}
