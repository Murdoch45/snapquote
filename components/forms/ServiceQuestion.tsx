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
    <div className={`space-y-3 rounded-xl border border-gray-200 bg-white p-4 ${disabled ? "opacity-60" : ""}`}>
      <Label className="text-sm font-medium text-gray-900">{question.question}</Label>

      {question.inputType === "select" ? (
        <select
          disabled={disabled}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => {
            const nextValue = event.target.value;
            onChange(question.key, nextValue);
            if (nextValue !== "Other") onChange(otherInputKey, "");
          }}
          className="flex h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-blue-100"
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
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
                  checked
                    ? "border-blue-600 bg-blue-50 text-blue-900"
                    : "border-gray-200 bg-white text-gray-700 hover:border-blue-300"
                }`}
              >
                <Checkbox
                  id={optionId}
                  checked={checked}
                  onCheckedChange={(nextChecked) => updateCheckboxValue(option, nextChecked === true)}
                  disabled={disabled}
                  className="border-gray-300 data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600"
                />
                <span>{option}</span>
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
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
                  value === option
                    ? "border-blue-600 bg-blue-50 text-blue-900"
                    : "border-gray-200 bg-white text-gray-700 hover:border-blue-300"
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
                  className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>{option}</span>
              </label>
            );
          })}
        </div>
      )}

      {isOtherSelected ? (
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-${otherInputKey}`}>Other</Label>
          <Input
            disabled={disabled}
            id={`${idPrefix}-${otherInputKey}`}
            value={otherText}
            onChange={(event) => onChange(otherInputKey, event.target.value)}
            placeholder={question.otherPlaceholder ?? "Add more detail"}
          />
          <p className="text-sm text-red-500 mt-1">
            Estimates are typically more accurate when one of the listed options is selected.
          </p>
        </div>
      ) : null}

      {helperText ? (
        <p className={helperTone === "error" ? "text-sm text-red-600" : "text-sm text-gray-500"}>
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
