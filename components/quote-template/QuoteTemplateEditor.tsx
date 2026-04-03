"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { CUSTOMER_NAME_TOKEN, ESTIMATE_LINK_TOKEN } from "@/lib/quote-template";
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
    key: "estimate_link",
    token: ESTIMATE_LINK_TOKEN,
    label: "Estimate Link"
  }
] as const;

type TokenKey = (typeof TOKEN_CONFIG)[number]["key"];

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  showCustomerNameChip?: boolean;
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
    throw new Error(`Unsupported estimate template token: ${tokenKey}`);
  }

  const chip = document.createElement("span");
  chip.dataset.token = tokenConfig.key;
  chip.contentEditable = "false";
  chip.draggable = true;
  chip.className =
    "mx-0.5 inline-flex cursor-grab select-none items-center gap-0.5 rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 align-middle";

  const label = document.createTextNode(tokenConfig.label);
  chip.appendChild(label);

  const xBtn = document.createElement("span");
  xBtn.dataset.removeToken = "true";
  xBtn.className = "ml-0.5 cursor-pointer rounded-full text-blue-400 hover:text-blue-700 leading-none";
  xBtn.textContent = "\u00d7";
  chip.appendChild(xBtn);

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

export function EstimateTemplateEditor({
  id,
  value,
  onChange,
  showCustomerNameChip = true,
  isEditing,
  isSaving = false,
  onEdit,
  onSave,
  onCancel
}: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [isTouch] = useState(() => isTouchDevice());

  const availableTokens = TOKEN_CONFIG.filter(
    (token) => token.key !== "customer_name" || showCustomerNameChip
  );

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

  const getInsertionRange = (): Range | null => {
    const editor = editorRef.current;
    if (!editor) return null;

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (editor.contains(range.startContainer)) return range;
    }

    if (savedRangeRef.current && editor.contains(savedRangeRef.current.startContainer)) {
      return savedRangeRef.current;
    }

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    return range;
  };

  const insertChipAtCursor = (tokenKey: TokenKey) => {
    const editor = editorRef.current;
    if (!editor) return;

    const chip = createTokenChip(tokenKey);
    const range = getInsertionRange();

    if (range) {
      range.deleteContents();
      range.insertNode(chip);
      range.setStartAfter(chip);
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } else {
      editor.appendChild(chip);
    }

    emitChange();
    editor.focus();
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
        /(\{\{customer_name\}\}|\{\{estimate_link\}\})/g
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

    if (segment === ESTIMATE_LINK_TOKEN) {
      return (
        <span key={`${segment}-${index}`} className="font-medium text-[#2563EB]">
          estimate-link.com/example
        </span>
      );
    }

    return <Fragment key={`${segment}-${index}`}>{segment}</Fragment>;
  };

  return (
    <div className="space-y-3">
      {isEditing ? (
        <>
          <div className="flex flex-wrap gap-2">
            {availableTokens.map((token) => (
              <button
                key={token.key}
                type="button"
                className={`inline-flex select-none items-center rounded-full border border-blue-200 bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 ${isTouch ? "active:bg-blue-200" : "cursor-grab"}`}
                draggable={!isTouch}
                onDragStart={
                  !isTouch
                    ? (event) => {
                        event.dataTransfer.setData("application/x-snapquote-token", token.token);
                        event.dataTransfer.effectAllowed = "move";
                      }
                    : undefined
                }
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => insertChipAtCursor(token.key as TokenKey)}
              >
                {token.label}
              </button>
            ))}
          </div>

          <div
            id={id}
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            className="min-h-40 w-full whitespace-pre-wrap rounded-[8px] border-2 border-[#2563EB] bg-white px-[14px] py-[10px] text-sm text-[#111827] shadow-[0_0_0_3px_rgba(37,99,235,0.1)] focus:outline-none"
            onClick={(event) => {
              const target = event.target as HTMLElement;
              if (target.dataset.removeToken) {
                event.preventDefault();
                const chip = target.closest("[data-token]");
                if (chip) {
                  chip.remove();
                  emitChange();
                }
              }
            }}
            onInput={() => emitChange()}
            onBlur={() => {
              const selection = window.getSelection();
              if (
                selection &&
                selection.rangeCount > 0 &&
                editorRef.current?.contains(selection.getRangeAt(0).startContainer)
              ) {
                savedRangeRef.current = selection.getRangeAt(0).cloneRange();
              }
              emitChange();
            }}
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

          <p className="text-xs text-[#9CA3AF]">
            Tap where you want to insert, then tap a token.
          </p>
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
    </div>
  );
}

// Backward compat export
export const QuoteTemplateEditor = EstimateTemplateEditor;
