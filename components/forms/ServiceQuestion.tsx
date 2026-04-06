"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  parseQuestionAnswer,
  type ServiceQuestionAnswerValue,
  type ServiceQuestionConfig
} from "@/lib/serviceQuestions";

type Props = {
  question: ServiceQuestionConfig;
  value?: ServiceQuestionAnswerValue;
  otherText?: string;
  onChange: (key: string, value: ServiceQuestionAnswerValue) => void;
  idPrefix?: string;
  disabled?: boolean;
  helperText?: string;
  helperTone?: "default" | "error";
};

export function ServiceQuestion({
  question,
  value = "",
  otherText = "",
  onChange,
  idPrefix = "service",
  disabled = false,
  helperText,
  helperTone = "default"
}: Props) {
  const otherInputKey = `${question.key}_other_text`;
  const selectedValues = parseQuestionAnswer(value);
  const isOtherSelected = selectedValues.includes("Other");
  const exclusiveOptions = new Set(question.exclusiveOptions ?? []);

  const updateCheckboxValue = (option: string, checked: boolean) => {
    if (disabled) return;

    const isCurrentlySelected = selectedValues.includes(option);
    let nextValues = selectedValues;

    if (checked && !isCurrentlySelected) {
      nextValues = exclusiveOptions.has(option)
        ? [option]
        : [...selectedValues.filter((item) => !exclusiveOptions.has(item)), option];
    }

    if (!checked && isCurrentlySelected) {
      nextValues = selectedValues.filter((item) => item !== option);
    }

    onChange(question.key, nextValues);
    if (!nextValues.includes("Other")) onChange(otherInputKey, "");
  };

  return (
    <div
      className={`min-w-0 max-w-full space-y-3 rounded-[12px] border border-[#E5E7EB] bg-white p-4 ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <Label className="text-[13px] font-semibold text-[#374151]">
        {question.question} <span className="text-[#2563EB]">*</span>
      </Label>

      {question.inputType === "select" ? (
        <select
          disabled={disabled}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => {
            const nextValue = event.target.value;
            onChange(question.key, nextValue);
            if (nextValue !== "Other") onChange(otherInputKey, "");
          }}
          className="flex w-full rounded-[8px] border border-[#E5E7EB] bg-white px-[14px] py-3 text-sm text-[#111827] outline-none transition focus:border-[#2563EB] focus:ring-4 focus:ring-[rgba(37,99,235,0.1)]"
        >
          <option value="">Select an option</option>
          {question.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : question.inputType === "checkbox" ? (
        <div className="space-y-2">
          {question.options.map((option) => {
            const optionId = `${idPrefix}-${question.key}-${option.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
            const checked = selectedValues.includes(option);

            return (
              <label
                key={option}
                htmlFor={optionId}
                className={`flex min-w-0 max-w-full cursor-pointer items-center gap-3 rounded-[10px] border p-3 text-sm transition-colors ${
                  checked
                    ? "border-[#2563EB] bg-[#EFF6FF] text-[#111827]"
                    : "border-[#E5E7EB] bg-white text-[#374151] hover:border-[#BFDBFE]"
                }`}
              >
                <Checkbox
                  id={optionId}
                  checked={checked}
                  onCheckedChange={(nextChecked) => updateCheckboxValue(option, nextChecked === true)}
                  disabled={disabled}
                  className="border-[#D1D5DB] data-[state=checked]:border-[#2563EB] data-[state=checked]:bg-[#2563EB]"
                />
                <span className="min-w-0 break-words">{option}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {question.options.map((option) => {
            const optionId = `${idPrefix}-${question.key}-${option.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
            return (
              <label
                key={option}
                htmlFor={optionId}
                className={`flex min-w-0 max-w-full cursor-pointer items-center gap-3 rounded-[10px] border p-3 text-sm transition-colors ${
                  value === option
                    ? "border-[#2563EB] bg-[#EFF6FF] text-[#111827]"
                    : "border-[#E5E7EB] bg-white text-[#374151] hover:border-[#BFDBFE]"
                }`}
              >
                <input
                  disabled={disabled}
                  id={optionId}
                  type="radio"
                  name={`${idPrefix}-${question.key}`}
                  value={option}
                  checked={typeof value === "string" && value === option}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    onChange(question.key, nextValue);
                    if (nextValue !== "Other") onChange(otherInputKey, "");
                  }}
                  className="h-4 w-4 border-[#D1D5DB] text-[#2563EB] focus:ring-[#2563EB]"
                />
                <span className="min-w-0 break-words">{option}</span>
              </label>
            );
          })}
        </div>
      )}

      {isOtherSelected ? (
        <div className="space-y-1">
          <Label
            htmlFor={`${idPrefix}-${otherInputKey}`}
            className="mb-1.5 block text-[13px] font-semibold text-[#374151]"
          >
            Other
          </Label>
          <Input
            disabled={disabled}
            id={`${idPrefix}-${otherInputKey}`}
            value={otherText}
            onChange={(event) => onChange(otherInputKey, event.target.value)}
            placeholder={question.otherPlaceholder ?? "Add more detail"}
            className="h-auto rounded-[8px] border-[#E5E7EB] bg-white px-[14px] py-3 text-sm text-[#111827] placeholder:text-[#6B7280] focus-visible:ring-[rgba(37,99,235,0.1)]"
          />
          <p className="mt-1 text-xs text-[#DC2626]">
            Estimates are typically more accurate when one of the listed options is selected.
          </p>
        </div>
      ) : null}

      {helperText ? (
        <p className={helperTone === "error" ? "text-xs text-[#DC2626]" : "text-xs text-[#6B7280]"}>
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
