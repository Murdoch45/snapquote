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
      className={`min-w-0 max-w-full space-y-3 rounded-[12px] border border-border bg-card p-4 ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <Label className="text-[13px] font-semibold text-foreground">
        {question.question} <span className="text-primary">*</span>
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
          className="flex w-full rounded-[8px] border border-border bg-card px-[14px] py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-[rgba(37,99,235,0.1)]"
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
                    ? "border-primary bg-accent text-foreground"
                    : "border-border bg-card text-foreground hover:border-primary/40"
                }`}
              >
                <Checkbox
                  id={optionId}
                  checked={checked}
                  onCheckedChange={(nextChecked) => updateCheckboxValue(option, nextChecked === true)}
                  disabled={disabled}
                  className="border-border data-[state=checked]:border-primary data-[state=checked]:bg-primary"
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
                    ? "border-primary bg-accent text-foreground"
                    : "border-border bg-card text-foreground hover:border-primary/40"
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
                  className="h-4 w-4 border-border text-primary focus:ring-ring"
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
            className="mb-1.5 block text-[13px] font-semibold text-foreground"
          >
            Other
          </Label>
          <Input
            disabled={disabled}
            id={`${idPrefix}-${otherInputKey}`}
            value={otherText}
            onChange={(event) => onChange(otherInputKey, event.target.value)}
            placeholder={question.otherPlaceholder ?? "Add more detail"}
            className="h-auto rounded-[8px] border-border bg-card px-[14px] py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-[rgba(37,99,235,0.1)]"
          />
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            Estimates are typically more accurate when one of the listed options is selected.
          </p>
        </div>
      ) : null}

      {helperText ? (
        <p className={helperTone === "error" ? "text-xs text-red-600 dark:text-red-400" : "text-xs text-muted-foreground"}>
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
