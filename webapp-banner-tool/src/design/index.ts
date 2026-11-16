/**
 * Public API of the ts-icon design system (README.md is the contract).
 *
 * App code imports from this file only: `from "../design"` in
 * src/components, `from "./design"` in src. ESLint forbids deep imports.
 * Layers: foundations (CSS at this root) -> primitives -> components -> patterns.
 */

// Primitives
export * from "./primitives/Icon";
export * from "./primitives/Button";
export { TextField, TextArea, Select, Checkbox } from "./primitives/Field";
export type { TextFieldProps, TextAreaProps, SelectProps, CheckboxProps } from "./primitives/Field";
export * from "./primitives/Layout";

// Components
export * from "./components/FieldError";
export * from "./components/RequestError";
export { ToastProvider } from "./components/Toast";
export { useToast, type ToastVariant } from "./components/ToastContext";
export * from "./components/UploadInput";
export * from "./components/States";
export * from "./components/PageHeader";
export * from "./components/BannerFrame";
export * from "./components/Toolbar";
export * from "./components/ListSection";
export * from "./components/FileButton";
export * from "./components/MenuButton";
export * from "./components/ConfirmDialog";
export * from "./components/StatusGlyph";
export * from "./components/TextLink";
export * from "./components/Studio";
export * from "./components/StateTile";

// Patterns
export * from "./patterns/Notice";
export * from "./patterns/AccessDenied";
export * from "./patterns/StudioShell";
export * from "./patterns/studioLayout";
