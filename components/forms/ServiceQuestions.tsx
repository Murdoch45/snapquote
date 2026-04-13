"use client";

import { ServiceQuestion } from "@/components/forms/ServiceQuestion";
import { Label } from "@/components/ui/label";
import {
  OTHER_OUTDOOR_QUESTION_KEY,
  OTHER_OUTDOOR_UNSUPPORTED_MESSAGE,
  serviceQuestions,
  type ServiceQuestionAnswerValue
} from "@/lib/serviceQuestions";
import type { ServiceType } from "@/lib/services";

type Props = {
  selectedService: ServiceType | "";
  answers: Record<string, ServiceQuestionAnswerValue>;
  onAnswerChange: (key: string, value: ServiceQuestionAnswerValue) => void;
  idPrefix?: string;
};

export function ServiceQuestions({
  selectedService,
  answers,
  onAnswerChange,
  idPrefix = "service"
}: Props) {
  if (!selectedService) return null;

  const questions = serviceQuestions[selectedService];
  const otherServiceBlocked =
    selectedService === "Other" &&
    typeof answers[OTHER_OUTDOOR_QUESTION_KEY] === "string" &&
    answers[OTHER_OUTDOOR_QUESTION_KEY] === "No";

  return (
    <div className="space-y-4 rounded-[12px] border border-border bg-muted p-5">
      <div className="space-y-1">
        <Label className="text-[13px] font-semibold text-foreground">Estimator Questions</Label>
        <p className="text-xs text-muted-foreground">
          Answer a few quick questions so the estimate request includes service-specific details.
        </p>
      </div>

      <div className="space-y-6">
        {questions.map((question) => (
          <ServiceQuestion
            key={question.key}
            question={question}
            value={answers[question.key]}
            otherText={
              typeof answers[`${question.key}_other_text`] === "string"
                ? (answers[`${question.key}_other_text`] as string)
                : ""
            }
            onChange={onAnswerChange}
            idPrefix={idPrefix}
            disabled={otherServiceBlocked && question.key !== OTHER_OUTDOOR_QUESTION_KEY}
            helperText={
              otherServiceBlocked && question.key === OTHER_OUTDOOR_QUESTION_KEY
                ? OTHER_OUTDOOR_UNSUPPORTED_MESSAGE
                : undefined
            }
            helperTone={question.key === OTHER_OUTDOOR_QUESTION_KEY ? "error" : "default"}
          />
        ))}
      </div>
    </div>
  );
}
