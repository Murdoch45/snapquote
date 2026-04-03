"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { CUSTOMER_NAME_TOKEN, QUOTE_LINK_TOKEN } from "@/lib/quote-template";
import { Button } from "@/components/ui/button";

function isTouchDevice(): boolean {
  return typeof window !== "undefined" && "ontouchstart" in window;
}

const TOKEN_CONFIG = [
  {
    key: "customer_name",
    token: CUSTOMER_NAME_TOKEN,
    label: "Customer Name"
  },
  {
    key: "quote_link",
    token: QUOTE_LINK_TOKEN,
    label: "Estimate Link"
  }
] as const;

type TokenKey = (typeof TOKEN_CONFIG)[number]["key"];

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  showCustomerNameChip?: boolean;
  previewBusinessName: string;
  previewPhone: string;
  previewEmail: string;
  isEditing: boolean;
  isSaving?: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
};

function getTokenConfigByKey(key: string | undefined) {
  return TOKEN_CONFIG.find((item) => item.key === key);
}

function getTokenConfigByToken(token: string) {
  return TOKEN_CONFIG.find((item) => item.token === token);
}

function createTokenChip(tokenKey: TokenKey): HTMLSpanElement {
  const tokenConfig = getTokenConfigByKey(tokenKey);
  if (!tokenConfig) {
    throw new Error(`Unsupported quote template token: ${tokenKey}`);
  }

  const chip = document.createElement("span");
  chip.dataset.token = tokenConfig.key;
  chip.contentEditable = "false";
  chip.draggable = true;
  chip.className =
    "mx-0.5 inline-flex cursor-grab select-none items-center rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 align-middle";
  chip.textContent = tokenConfig.label;
  return chip;
}

function getRangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (
      x: number,
      y: number
    ) => { offsetNode: Node; offset: number } | null;
  };

  if (typeof doc.caretRangeFromPoint === "function") {
    return doc.caretRangeFromPoint(x, y);
  }

  if (typeof doc.caretPositionFromPoint === "function") {
    const position = doc.caretPositionFromPoint(x, y);
    if (!position) return null;

    const range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    return range;
  }

  return null;
}

export function QuoteTemplateEditor({
  id,
  value,
  onChange,
  showCustomerNameChip = true,
  previewBusinessName,
  previewPhone,
  previewEmail,
  isEditing,
  isSaving = false,
  onEdit,
  onSave,
  onCancel
}: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isTouch] = useState(() => isTouchDevice());
  const lastCursorRef = useRef<number | null>(null);

  const availableTokens = TOKEN_CONFIG.filter(
    (token) => token.key !== "customer_name" || showCustomerNameChip
  );

  const insertTokenIntoValue = (token: string) => {
    const pos = lastCursorRef.current;
    if (pos !== null && pos >= 0 && pos <= value.length) {
      const before = value.slice(0, pos);
      const after = value.slice(pos);
      const spaceBefore = before.length > 0 && !before.endsWith(" ") && !before.endsWith("\n") ? " " : "";
      const spaceAfter = after.length > 0 && !after.startsWith(" ") && !after.startsWith("\n") ? " " : "";
      onChange(before + spaceBefore + token + spaceAfter + after);
    } else {
      const spacer = value.length > 0 && !value.endsWith(" ") && !value.endsWith("\n") ? " " : "";
      onChange(value + spacer + token);
    }
  };

  const serializeEditor = () => {
    const editor = editorRef.current;
    if (!editor) return "";

    const serializeNode = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent ?? "";
      }

      if (!(node instanceof HTMLElement)) {
        return "";
      }

      const tokenConfig = getTokenConfigByKey(node.dataset.token);
      if (tokenConfig) {
        return tokenConfig.token;
      }

      if (node.tagName === "BR") {
        return "\n";
      }

      return Array.from(node.childNodes).map(serializeNode).join("");
    };

    return Array.from(editor.childNodes).map(serializeNode).join("");
  };

  const emitChange = () => {
    const serialized = serializeEditor();
    if (serialized !== value) {
      onChange(serialized);
    }
  };

  const insertTextAtSelection = (text: string) => {
    const selection = window.getSelection();
    const editor = editorRef.current;

    if (!selection || !editor) return;

    let range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (!range || !editor.contains(range.startContainer)) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }

    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (!isEditing) return;

    if (serializeEditor() === value) {
      return;
    }

    editor.innerHTML = "";
    const tokenPattern = new RegExp(
      `(${TOKEN_CONFIG.map((item) => item.token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
      "g"
    );
    const segments = value.split(tokenPattern).filter((segment) => segment.length > 0);

    segments.forEach((segment) => {
      const tokenConfig = getTokenConfigByToken(segment);
      if (tokenConfig) {
        if (tokenConfig.key === "customer_name" && !showCustomerNameChip) {
          return;
        }

        editor.appendChild(createTokenChip(tokenConfig.key));
        return;
      }

      editor.appendChild(document.createTextNode(segment));
    });

    if (value.length === 0) {
      editor.appendChild(document.createElement("br"));
    }
  }, [isEditing, showCustomerNameChip, value]);

  useEffect(() => {
    if (!isEditing) return;
    editorRef.current?.focus();
  }, [isEditing]);

  const previewSegments = useMemo(
    () =>
      value.split(
        /(\{\{customer_name\}\}|\{\{quote_link\}\}|\{\{company_name\}\}|\{\{contractor_phone\}\}|\{\{contractor_email\}\})/g
      ),
    [value]
  );

  const renderPreviewSegment = (segment: string, index: number) => {
    if (segment === CUSTOMER_NAME_TOKEN) {
      return (
        <span
          key={`${segment}-${index}`}
          className="mx-0.5 inline-flex items-center rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 align-middle"
        >
          Customer Name
        </span>
      );
    }

    if (segment === QUOTE_LINK_TOKEN) {
      return (
        <span key={`${segment}-${index}`} className="font-medium text-[#2563EB]">
          estimate-link.com/example
        </span>
      );
    }

    if (segment === "{{company_name}}") {
      return <Fragment key={`${segment}-${index}`}>{previewBusinessName || "Your Company"}</Fragment>;
    }

    if (segment === "{{contractor_phone}}") {
      return <Fragment key={`${segment}-${index}`}>{previewPhone || "Your Phone Number"}</Fragment>;
    }

    if (segment === "{{contractor_email}}") {
      return <Fragment key={`${segment}-${index}`}>{previewEmail || "your@email.com"}</Fragment>;
    }

    return <Fragment key={`${segment}-${index}`}>{segment}</Fragment>;
  };

  return (
    <div className="space-y-3">
      {isEditing ? (
        <>
          <div className="flex flex-wrap gap-2">
            {availableTokens.map((token) =>
              isTouch ? (
                <button
                  key={token.key}
                  type="button"
                  className="inline-flex select-none items-center rounded-full border border-blue-200 bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 active:bg-blue-200"
                  onClick={() => {
                    setTimeout(() => insertTokenIntoValue(token.token), 0);
                  }}
                >
                  {token.label}
                </button>
              ) : (
                <button
                  key={token.key}
                  type="button"
                  className="inline-flex cursor-grab select-none items-center rounded-full border border-blue-200 bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("application/x-snapquote-token", token.token);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => {
                    const editor = editorRef.current;
                    if (!editor) return;

                    editor
                      .querySelectorAll(`[data-token='${token.key}']`)
                      .forEach((node) => node.remove());

                    const chip = createTokenChip(token.key);
                    const selection = window.getSelection();
                    let range =
                      selection && selection.rangeCount > 0
                        ? selection.getRangeAt(0)
                        : null;

                    if (!range || !editor.contains(range.startContainer)) {
                      range = document.createRange();
                      range.selectNodeContents(editor);
                      range.collapse(false);
                    }

                    range.deleteContents();
                    range.insertNode(chip);
                    range.setStartAfter(chip);
                    range.collapse(true);
                    selection?.removeAllRanges();
                    selection?.addRange(range);

                    emitChange();
                    editor.focus();
                  }}
                >
                  {token.label}
                </button>
              )
            )}
          </div>

          {isTouch ? (
            <>
              <textarea
                ref={textareaRef}
                id={id}
                className="min-h-40 w-full whitespace-pre-wrap rounded-[8px] border-2 border-[#2563EB] bg-white px-[14px] py-[10px] text-sm text-[#111827] shadow-[0_0_0_3px_rgba(37,99,235,0.1)] focus:outline-none"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onClick={(e) => {
                  lastCursorRef.current = (e.target as HTMLTextAreaElement).selectionStart;
                }}
                onSelect={(e) => {
                  lastCursorRef.current = (e.target as HTMLTextAreaElement).selectionStart;
                }}
                onTouchEnd={() => {
                  lastCursorRef.current = textareaRef.current?.selectionStart ?? null;
                }}
                onBlur={() => {
                  lastCursorRef.current = textareaRef.current?.selectionStart ?? null;
                }}
              />
              <p className="mt-1 text-xs text-[#9CA3AF]">
                Tap where you want to insert, then tap a token.
              </p>
            </>
          ) : (
            <div
              id={id}
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              className="min-h-40 w-full whitespace-pre-wrap rounded-[8px] border-2 border-[#2563EB] bg-white px-[14px] py-[10px] text-sm text-[#111827] shadow-[0_0_0_3px_rgba(37,99,235,0.1)] focus:outline-none"
              onInput={() => emitChange()}
              onBlur={() => emitChange()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  insertTextAtSelection("\n");
                  emitChange();
                }
              }}
              onPaste={(event) => {
                event.preventDefault();
                const text = event.clipboardData.getData("text/plain");
                insertTextAtSelection(text);
                emitChange();
              }}
              onDragStart={(event) => {
                const target = event.target;
                if (!(target instanceof HTMLElement) || !target.dataset.token) {
                  return;
                }

                const tokenConfig = getTokenConfigByKey(target.dataset.token);
                if (!tokenConfig) return;

                event.dataTransfer.setData("application/x-snapquote-token", tokenConfig.token);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();

                const token =
                  event.dataTransfer.getData("application/x-snapquote-token") ||
                  event.dataTransfer.getData("text/plain");
                const tokenConfig = getTokenConfigByToken(token);
                if (!tokenConfig) return;
                if (tokenConfig.key === "customer_name" && !showCustomerNameChip) return;

                const editor = editorRef.current;
                if (!editor) return;

                editor
                  .querySelectorAll(`[data-token='${tokenConfig.key}']`)
                  .forEach((node) => node.remove());

                const chip = createTokenChip(tokenConfig.key);
                const dropRange = getRangeFromPoint(event.clientX, event.clientY);

                if (dropRange && editor.contains(dropRange.startContainer)) {
                  dropRange.deleteContents();
                  dropRange.insertNode(chip);
                  dropRange.setStartAfter(chip);
                  dropRange.collapse(true);
                  const selection = window.getSelection();
                  selection?.removeAllRanges();
                  selection?.addRange(dropRange);
                } else {
                  editor.appendChild(chip);
                }

                emitChange();
              }}
            />
          )}
        </>
      ) : (
        <div className="whitespace-pre-wrap rounded-[8px] border border-[#E5E7EB] bg-[#F8F9FC] p-4 text-sm text-[#111827]">
          {previewSegments.map((segment, index) => renderPreviewSegment(segment, index))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={isEditing ? "default" : "outline"}
          className={
            isEditing
              ? "font-semibold"
              : "border-2 border-[#2563EB] bg-transparent font-semibold text-[#2563EB] hover:bg-[#EFF6FF] hover:text-[#2563EB]"
          }
          onClick={isEditing ? onSave : onEdit}
          disabled={isSaving}
        >
          {isEditing ? (isSaving ? "Saving..." : "Save Template") : "Edit Template"}
        </Button>
        {isEditing ? (
          <button
            type="button"
            className="text-sm text-[#6B7280] transition-colors hover:text-[#111827]"
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </button>
        ) : null}
      </div>

      <p className="text-xs text-[#6B7280]">
        {isTouch
          ? "Tap where you want to insert, then tap a token."
          : "Drag a token into your message, or click to insert at cursor."}
      </p>
    </div>
  );
}
