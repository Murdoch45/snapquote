"use client";

import { useEffect, useRef } from "react";

export const CUSTOMER_NAME_TOKEN = "{{customer_name}}";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
};

function createCustomerNameChip(): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.dataset.token = "customer_name";
  chip.contentEditable = "false";
  chip.draggable = true;
  chip.className =
    "mx-0.5 inline-flex cursor-grab select-none items-center rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 align-middle";
  chip.textContent = "👤 Customer Name";
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

export function QuoteTemplateEditor({ id, value, onChange }: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null);

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

      if (node.dataset.token === "customer_name") {
        return CUSTOMER_NAME_TOKEN;
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

    if (serializeEditor() === value) {
      return;
    }

    editor.innerHTML = "";
    const segments = value.split(CUSTOMER_NAME_TOKEN);

    segments.forEach((segment, index) => {
      if (segment.length > 0) {
        editor.appendChild(document.createTextNode(segment));
      }

      if (index < segments.length - 1) {
        editor.appendChild(createCustomerNameChip());
      }
    });

    if (value.length === 0) {
      editor.appendChild(document.createElement("br"));
    }
  }, [value]);

  return (
    <div
      id={id}
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      className="min-h-40 w-full whitespace-pre-wrap rounded-[8px] border border-[#E5E7EB] bg-white px-[14px] py-[10px] text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
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
        if (!(target instanceof HTMLElement) || target.dataset.token !== "customer_name") {
          return;
        }

        event.dataTransfer.setData("application/x-snapquote-token", CUSTOMER_NAME_TOKEN);
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
        if (token !== CUSTOMER_NAME_TOKEN) return;

        const editor = editorRef.current;
        if (!editor) return;

        editor.querySelectorAll("[data-token='customer_name']").forEach((node) => node.remove());

        const chip = createCustomerNameChip();
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
  );
}
